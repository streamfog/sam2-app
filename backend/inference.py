from typing import List
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

import base64
import cv2
import glob
import json
import numpy as np
import os
import requests
import shutil
import subprocess
import torch
import uuid
from PIL import Image

from sam2.build_sam import build_sam2_video_predictor
from sam2.utils.amg import mask_to_rle_pytorch, rle_to_mask


app = FastAPI()


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Dictionary to hold session states
session_states = {}
checkpoint = "./sam2_hiera_large.pt"
model_cfg = "sam2_hiera_l.yaml"

checkpoint = "./sam2_hiera_base_plus.pt"
model_cfg = "sam2_hiera_b+.yaml"

checkpoint = "./sam2_hiera_small.pt"
model_cfg = "sam2_hiera_s.yaml"

predictor = build_sam2_video_predictor(model_cfg, checkpoint)

class CreateSessionData(BaseModel):
    s3_link: str

class CreateSessionResponse(BaseModel):
    session_id: str
    frames: List[str]


@app.post("/create_session/", response_model=CreateSessionResponse)
async def create_session(data: CreateSessionData):
    try:
        # Generate a unique session ID
        session_id = str(uuid.uuid4())

        # Create directories
        frames_dir = f"./tmp/{session_id}"
        os.makedirs(frames_dir, exist_ok=True)

        # Download the video from the S3 link
        video_path = os.path.join(frames_dir, f"{session_id}.mp4")
        response = requests.get(data.s3_link)
        
        with open(video_path, 'wb') as f:
            f.write(response.content)

        # Extract frames using FFmpeg
        ffmpeg_command = [
            "ffmpeg",
            "-i", video_path,
            "-vf", "fps=24",
            "-q:v", "2",
            "-pix_fmt", "yuvj444p",
            f"{frames_dir}/%03d.jpg"
        ]
        subprocess.run(ffmpeg_command, check=True)
        os.remove(video_path)
        # Initialize the predictor and state with the downloaded video
        inference_state = predictor.init_state(frames_dir)

        # Store the inference state in the session dictionary
        session_states[session_id] = {
            "inference_state": inference_state,
            "frames_dir": frames_dir
        }

        frames = []
        for filename in sorted(os.listdir(frames_dir)):
            if filename.endswith(".jpg"):
                with open(os.path.join(frames_dir, filename), "rb") as image_file:
                    encoded_string = base64.b64encode(image_file.read()).decode('utf-8')
                    frames.append(encoded_string)

        return CreateSessionResponse(session_id=session_id, frames=frames)
    
    except subprocess.CalledProcessError as e:
        print(f"FFmpeg error: {e}")
        raise HTTPException(status_code=500, detail="Error processing video")
    except Exception as e:
        print(e)
        raise HTTPException(status_code=500, detail=str(e))

class ClickData(BaseModel):
    sessionId: str
    frameIndex: int
    objectId: int
    labels: List[int]
    points: List[List[float]]
    clearOldPoints: bool
    resetState: bool

# SAM2ModelAddNewPointsMutation
@app.post("/add_new_points/")
async def predict(data: ClickData):
    
    # Retrieve the session state using the session ID
    print(data)
    session = session_states.get(data.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session ID not found.")

    inference_state = session["inference_state"]
    if data.resetState:
        predictor.reset_state_for_objectId(inference_state , data.objectId)

    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16):

        frame_idx, out_obj_ids, out_mask_logits = predictor.add_new_points_or_box(
            inference_state=inference_state,
            frame_idx=data.frameIndex,
            obj_id=data.objectId,
            points=np.array(data.points, dtype=np.float32),
            labels=np.array(data.labels, dtype=np.int32),
            clear_old_points=True, #data.clearOldPoints,
            normalize_coords=False
        )

        rleMaskList = []

        for idx, objId in enumerate(out_obj_ids):
            uncompressed_rle = mask_to_rle_pytorch(out_mask_logits[idx] > 0.0)
            rleMaskList.append({
                    "objectId": objId,
                    "rleMask": uncompressed_rle[0]
                }
            )

        return {
            "addPoints": {
                "frameIndex": frame_idx,
                "rleMaskList": rleMaskList
            }
        }

def generate_frames(sessionId):
    session = session_states.get(sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session ID not found.")
    inference_state = session["inference_state"]
    
    session["results"] = {}
    for out_frame_idx, out_obj_ids, out_mask_logits in predictor.propagate_in_video(inference_state):
        rleMaskList = []

        for idx, objId in enumerate(out_obj_ids):
            uncompressed_rle = mask_to_rle_pytorch(out_mask_logits[idx] > 0.0)
            rleMaskList.append({
                    "objectId": objId,
                    "mask": uncompressed_rle[0]
                }
            )
        return_object = {
                "frameIndex": out_frame_idx,
                "results": rleMaskList
            }
        session["results"][out_frame_idx] = rleMaskList
        yield json.dumps(return_object) + "frameseparator"

class PropagateData(BaseModel):
    sessionId: str
    start_frame_index: int

@app.post("/propagate_in_video")
async def stream_response(data: PropagateData):
    return StreamingResponse(
        generate_frames(data.sessionId),
        media_type="multipart/x-savi-stream",
        headers={
            "Content-Type": "multipart/x-savi-stream; boundary=frame"
        }
    )

class GenerateData(BaseModel):
    sessionId: str
    effect: str

@app.post("/generate_video")
async def generate(data: GenerateData):
    session = session_states.get(data.sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session ID not found.")

    results = session["results"]
    frames_dir = session["frames_dir"]
    output_dir = os.path.join(frames_dir, "output")
    os.makedirs(output_dir, exist_ok=True)

    # Process each frame
    for frame_idx in range(1, 241):  # Assuming 240 frames as in the original code
        input_image_path = os.path.join(frames_dir, f"{frame_idx:03d}.jpg")
        output_image_path = os.path.join(output_dir, f"{frame_idx:03d}.png")
        if not os.path.exists(input_image_path):
            continue

        # Read the input image
        input_image = cv2.imread(input_image_path)
        input_image = cv2.cvtColor(input_image, cv2.COLOR_BGR2RGBA)

        # Create a mask for this frame
        mask = np.zeros((input_image.shape[0], input_image.shape[1]), dtype=np.uint8)
        
        for result in results[frame_idx-1]:
            object_mask = rle_to_mask(result["mask"])
            object_mask = np.array(object_mask).reshape(input_image.shape[:2])
            mask = np.logical_or(mask, object_mask)

        # Apply the mask to the input image
        input_image[:, :, 3] = mask.astype(np.uint8) * 255
        input_image[mask == 0, :3] = [0, 0, 0]

        # Save the masked image as PNG
        Image.fromarray(input_image).save(output_image_path)

    # Create WebM video from the processed frames
    output_video_path = os.path.join(output_dir, "output.webm")
    ffmpeg_command = [
        "ffmpeg",
        "-framerate", "24",
        "-i", f"{output_dir}/%03d.png",
        "-c:v", "libvpx-vp9",
        "-pix_fmt", "yuva420p",
        "-lossless", "1",
        "-loop", "0",
        output_video_path
    ]
    subprocess.run(ffmpeg_command, check=True)

    # Return the video file
    return FileResponse(output_video_path, media_type="video/webm", filename="output.webm")

@app.get("/masks/{sessionId}")
async def get_masks(sessionId: str):
    # Retrieve the session by session ID
    session = session_states.get(sessionId)
    if not session:
        raise HTTPException(status_code=404, detail="Session ID not found.")

    results = session["results"]
    if not results:
        raise HTTPException(status_code=404, detail="No results found for this session.")

    # Return all masks as JSON
    return {"sessionId": sessionId, "frames": results}

@app.delete("/delete_session/{session_id}")
async def delete_session(session_id: str):
    global predictor
    # Remove the session state
    session = session_states.pop(session_id, None)
    if not session:
        raise HTTPException(status_code=404, detail="Session ID not found.")

    inference_state = session["inference_state"]
    predictor.reset_state(inference_state)
    del inference_state
    predictor = build_sam2_video_predictor(model_cfg, checkpoint)

    torch.cuda.empty_cache()
    print(session_states)

    # Optionally, remove the video file
    frames_dir = session["frames_dir"]
    if os.path.exists(frames_dir):
        shutil.rmtree(frames_dir)

    return {"message": "Session deleted successfully."}



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

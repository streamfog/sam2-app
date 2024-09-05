import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  Card,
  CardContent,
  Button,
  Typography,
  Box,
  Divider,
  CardActions,
  IconButton,
  Stack,
  Tooltip,
  Grid,
  CircularProgress,
} from "@mui/material";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import { DetectionObject } from "./DetectionObject";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { Timer } from "@mui/icons-material";
import InstructionPopup from "./components/models/Instructions";

interface VideoPlayerProps {
  videoUrl: string;
}

const HOST_ADRESS =
  "http://ec2-12-345-67-890.eu-central-1.compute.amazonaws.com";

export const buttonStyles = {
  backgroundColor: "#7cd959",
  border: "2px solid #7cd959",
  color: "#000",
  py: 1,
  borderRadius: 2,
  fontWeight: "bold",
  "&:hover": {
    backgroundColor: "transparent",
    color: "#7cd959",
  },
  "&.Mui-disabled": {
    backgroundColor: "#7cd959",
    color: "#000",
  },
};

const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl }) => {
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = useRef<boolean>(false);
  const [playing, setPlaying] = useState<boolean>(false);
  const currentFrame = useRef<number>(0);
  const sessionIdRef = useRef<String>("");
  const effectRan = useRef(false);
  const [detectionObjectList, setDetectionObjectList] = useState<
    DetectionObject[]
  >([]);
  const [activeObjectIdx, setActiveObjectIdx] = useState(0);
  const [newClick, setNewClick] = useState<boolean>(false);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(false);
  const [isCurrentlyTracking, setIsCurrentlyTracking] =
    useState<boolean>(false);
  const [hasTrackedAlready, setHasTrackedAlready] = useState<boolean>(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [VIDEO_WIDTH, set_VIDEO_WIDTH] = useState(1280);
  const [VIDEO_HEIGHT, set_VIDEO_HEIGHT] = useState(720);
  const TIMELINE_WIDTH = 900;
  const TIMELINE_HEIGHT = 35;
  const TOTAL_FRAMES = 240;
  const FPS = 24;

  useEffect(() => {
    const updateWidth = () => {
      if (boxRef.current) {
        const height = boxRef.current.offsetHeight;
        const width = height * (16 / 9);
        boxRef.current.style.width = `${width}px`;
        boxRef.current.style.height = `${height}px`;
        set_VIDEO_WIDTH(width);
        set_VIDEO_HEIGHT(height);
      }
    };

    // Initial update
    updateWidth();
  }, [boxRef.current]);

  const addDetectionObject = () => {
    setDetectionObjectList([
      ...detectionObjectList,
      new DetectionObject(maskColors[detectionObjectList.length]),
    ]);
    setActiveObjectIdx(detectionObjectList.length);
  };

  const removeDetectionObject = (index: number) => {
    const newList = detectionObjectList.filter((_, i) => i !== index);
    setDetectionObjectList(newList);
    if (activeObjectIdx >= newList.length) {
      setActiveObjectIdx(newList.length - 1);
    }
  };


  interface ImageObject {
    id: number;
    src: string;
  }

  const [images, setImages] = useState<ImageObject[]>([]);

  useEffect(() => {
    if (newClick) {
      drawFrame(currentFrame.current);
      //drawMasks();
      setNewClick(false);
    }
  }, [detectionObjectList, newClick]);

  const drawFrame = useCallback(
    (frameIdx: number) => {
      if (images.length > frameIdx) {
        const canvas = videoCanvasRef.current;

        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) {
            const img = new Image();
            img.onload = () => {
              requestAnimationFrame(() => {
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                detectionObjectList.forEach((detectionObject) => {
                  if (currentFrame.current in detectionObject.outputs) {
                    const maskObj =
                      detectionObject.outputs[currentFrame.current].rleMasks;
                    const binary_mask = decodeColumnwiseCocoRLE(
                      maskObj.size,
                      maskObj.counts
                    );

                    if (videoCanvasRef.current) {
                      drawBinaryMaskOnCanvas(
                        binary_mask,
                        videoCanvasRef.current,
                        detectionObject.maskColor,
                        ctx
                      );
                    }
                  }
                });
              });
            };
            img.onerror = (error) => {
              console.error("Error loading image:", error);
            };
            img.src = images[frameIdx].src;
          } else {
            console.error("Unable to get 2D context from canvas");
          }
        } else {
          console.error("Canvas reference is null");
        }
      } else {
        console.error(`No image available at index ${frameIdx}`);
      }
    },
    [images, detectionObjectList]
  );

  const drawTimeline = () => {
    const canvas = timelineCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, TIMELINE_WIDTH, TIMELINE_HEIGHT);
        for (let i = 0; i < TOTAL_FRAMES; i++) {
          const x = (i / TOTAL_FRAMES) * TIMELINE_WIDTH;
          ctx.fillStyle = i % FPS === 0 ? "#888" : "#ccc";
          ctx.fillRect(x, 0, 1, TIMELINE_HEIGHT);
        }
      }
    }
  };

  const updateTimeIndicator = (frame: number) => {
    const canvas = timelineCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, TIMELINE_WIDTH, TIMELINE_HEIGHT);
        drawTimeline();
        const x = (frame / TOTAL_FRAMES) * TIMELINE_WIDTH;
        ctx.fillStyle = "red";
        ctx.fillRect(x - 1, 0, 2, TIMELINE_HEIGHT);
      }
    }
  };

  const playVideo = useCallback(() => {
    let lastTimestamp: number | null = null;
    const frameDuration = 1000 / 24; // 24 fps

    const animate = (timestamp: number) => {
      if (!isPlaying.current) return;
      if (
        lastTimestamp === null ||
        timestamp - lastTimestamp >= frameDuration
      ) {
        requestAnimationFrame(() => {
          drawFrame(currentFrame.current);
          updateTimeIndicator(currentFrame.current);
          if (timeRef.current) {
            timeRef.current.textContent = formatTime(currentFrame.current);
          }
        });
        currentFrame.current = (currentFrame.current + 1) % images.length;
        lastTimestamp = timestamp;
      }

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
  }, [isPlaying.current, images.length, detectionObjectList]);

  const handlePlayPause = useCallback(() => {
    setPlaying(!playing);
    isPlaying.current = !isPlaying.current;
    if (isPlaying.current) {
      playVideo();
    }
  }, [playVideo]);

  const handleTimelineClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = timelineCanvasRef.current;
    //if (svgRef.current) clearSVG(svgRef.current);
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const clickedFrame = Math.floor((x / TIMELINE_WIDTH) * TOTAL_FRAMES);
      drawFrame(clickedFrame);
      currentFrame.current = clickedFrame;
      updateTimeIndicator(clickedFrame);
      if (timeRef.current) {
        timeRef.current.textContent = formatTime(currentFrame.current);
      }
      setDetectionObjectList([...detectionObjectList]);
    }
  };

  useEffect(() => {
    const hasInputs = detectionObjectList.some(
      (obj) => Object.keys(obj.inputs).length > 0
    );

    if (!hasInputs) {
      setTrackingEnabled(false);
    }
  }, [detectionObjectList]);

  const formatTime = (frame: number) => {
    console.log(frame, "FRAME");
    const totalSeconds = Math.floor(frame / FPS);
    const seconds = totalSeconds % 60;
    const frames = frame % FPS;
    return `${seconds.toString().padStart(2, "0")}:${frames
      .toString()
      .padStart(2, "0")}`;
  };

  useEffect(() => {
    if (effectRan.current === false) {
      const createSession = async () => {
        sessionIdRef.current = "";

        try {
          const response = await axios.post(
            `${HOST_ADRESS}:8000/create_session/`,
            {
              s3_link: videoUrl,
            }
          );
          sessionIdRef.current = response.data.session_id;
          // Process and save the received images
          const newImages = response.data.frames.map(
            (frame: string, index: number) => ({
              id: index,
              src: `data:image/jpeg;base64,${frame}`,
            })
          );
          setImages(newImages);
          setLoading(false);
        } catch (err) {
          console.error("Failed to create session:", err);
          setLoading(false);
        }
      };
      drawTimeline();
      createSession();
      //addDetectionObject();

      effectRan.current = true;
    }
  }, []);

  useEffect(() => {
    if (images.length > 0) {
      drawFrame(0);
      if (timeRef.current) {
        timeRef.current.textContent = formatTime(currentFrame.current);
      }
      addDetectionObject();
    }
  }, [images]);

  type FlatBinaryMask = number[];
  type BinaryMask = number[][];

  function decodeColumnwiseCocoRLE_old(
    [rows, cols]: [number, number],
    counts: number[],
    flat: boolean = false
  ): number[] | number[][] {
    let pixelPosition = 0;
    let binaryMask: number[] | number[][];

    if (flat) {
      binaryMask = Array(rows * cols).fill(0);
    } else {
      binaryMask = Array.from({ length: rows }, () => Array(cols).fill(0));
    }

    for (let i = 0, rleLength = counts.length; i < rleLength; i += 2) {
      let zeros = counts[i];
      let ones = counts[i + 1] ?? 0;

      pixelPosition += zeros;

      while (ones > 0) {
        const colIndex = Math.floor(pixelPosition / rows);
        const rowIndex = pixelPosition % rows;

        if (flat) {
          (binaryMask as number[])[rowIndex * cols + colIndex] = 1;
        } else {
          (binaryMask as number[][])[rowIndex][colIndex] = 1;
        }

        pixelPosition++;
        ones--;
      }
    }

    return binaryMask;
  }

  function decodeColumnwiseCocoRLE(
    [rows, cols]: [number, number],
    counts: number[],
    flat: boolean = false
  ): number[] | number[][] {
    const totalPixels = rows * cols;
    let binaryMask: number[] | number[][];

    if (flat) {
      binaryMask = new Array(totalPixels).fill(0);
    } else {
      binaryMask = Array.from({ length: rows }, () => new Array(cols).fill(0));
    }

    let pixelPosition = 0;
    for (let i = 0; i < counts.length; i += 2) {
      pixelPosition += counts[i];
      const ones = counts[i + 1] || 0;

      if (flat) {
        for (let j = 0; j < ones; j++) {
          const index =
            (pixelPosition % rows) * cols + Math.floor(pixelPosition / rows);
          (binaryMask as number[])[index] = 1;
          pixelPosition++;
        }
      } else {
        for (let j = 0; j < ones; j++) {
          const colIndex = Math.floor(pixelPosition / rows);
          const rowIndex = pixelPosition % rows;
          (binaryMask as number[][])[rowIndex][colIndex] = 1;
          pixelPosition++;
        }
      }
    }

    return binaryMask;
  }

  function hexToRGBA(hex: string, alpha = 1) {
    // Remove the hash if it exists
    hex = hex.replace(/^#/, "");

    // Parse the hex values
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);

    // Return the RGBA string
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  // Usage

  function drawBinaryMaskOnCanvas(
    binaryMask: FlatBinaryMask | BinaryMask,
    canvas: HTMLCanvasElement,
    color: string = "rgba(255, 0, 0, 0.5)",
    ctx: CanvasRenderingContext2D
  ): void {
    const width = canvas.width;
    const height = canvas.height;

    // Determine if the mask is flat or 2D
    const isFlat = !Array.isArray(binaryMask[0]);

    ctx.fillStyle = hexToRGBA(color, 0.5);

    if (isFlat) {
      const flatMask = binaryMask as FlatBinaryMask;
      for (let i = 0; i < flatMask.length; i++) {
        if (flatMask[i] === 1) {
          const x = i % width;
          const y = Math.floor(i / width);
          ctx.fillRect(x, y, 1, 1);
        }
      }
    } else {
      const mask2D = binaryMask as BinaryMask;
      for (let y = 0; y < mask2D.length; y++) {
        for (let x = 0; x < mask2D[y].length; x++) {
          if (mask2D[y][x] === 1) {
            ctx.fillRect(x, y, 1, 1);
          }
        }
      }
    }
  }

  const handleRemoveInput = async (objectIndex: number, pointIndex: number) => {
    // Create a deep copy of the detectionObjectList

    // Remove the specific point and label
    detectionObjectList[objectIndex].inputs[currentFrame.current].points.splice(
      pointIndex,
      1
    );
    detectionObjectList[objectIndex].inputs[currentFrame.current].labels.splice(
      pointIndex,
      1
    );

    if (
      detectionObjectList[objectIndex].inputs[currentFrame.current].labels
        .length === 0
    ) {
      delete detectionObjectList[objectIndex].inputs[currentFrame.current];
      detectionObjectList[objectIndex].removeOutput(currentFrame.current);
    } else {
      const currentDetection = detectionObjectList[objectIndex];
      const payload = {
        sessionId: sessionIdRef.current,
        frameIndex: currentFrame.current,
        objectId: currentDetection.objectId,
        labels: currentDetection.inputs[currentFrame.current].labels,
        points: currentDetection.inputs[currentFrame.current].points,
        clearOldPoints: true,
        resetState: true,
      };

      const response = await axios.post(
        `${HOST_ADRESS}:8000/add_new_points/`,
        payload
      );
      response.data.addPoints.rleMaskList.forEach((maskObj: any) => {
        const objectId = maskObj.objectId;
        detectionObjectList[objectId].setOutput(
          currentFrame.current,
          maskObj.rleMask
        );
      });
    }
    setDetectionObjectList([...detectionObjectList]);
    setNewClick(true);
  };

  const handleVideoClick = async (
    event: React.MouseEvent<HTMLCanvasElement>,
    label: number
  ) => {
    const canvas = videoCanvasRef.current;

    if (label === 0) {
      event.preventDefault();
    } else {
      setTrackingEnabled(true);
    }

    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Calculate normalized position
      const normalizedX = x / VIDEO_WIDTH;
      const normalizedY = y / VIDEO_HEIGHT;

      const currentDetection = detectionObjectList[activeObjectIdx];
      currentDetection?.addInput(currentFrame.current, label, [
        normalizedX,
        normalizedY,
      ]);

      const payload = {
        sessionId: sessionIdRef.current,
        frameIndex: currentFrame.current,
        objectId: currentDetection.objectId,
        labels: currentDetection.inputs[currentFrame.current].labels,
        points: currentDetection.inputs[currentFrame.current].points,
        clearOldPoints: true,
        resetState: false,
      };

      const response = await axios.post(
        `${HOST_ADRESS}:8000/add_new_points/`,
        payload
      );
      response.data.addPoints.rleMaskList.forEach((maskObj: any) => {
        const objectId = maskObj.objectId;
        detectionObjectList[objectId].setOutput(
          currentFrame.current,
          maskObj.rleMask
        );
      });

      setNewClick(true);
      setDetectionObjectList([...detectionObjectList]);
    }
  };

  function clearSVG(svgElement: SVGSVGElement) {
    while (svgElement.firstChild) {
      svgElement.removeChild(svgElement.firstChild);
    }
  }

  function isValidJSON(input: string): boolean {
    try {
      JSON.parse(input);
      return true;
    } catch (error) {
      console.log(error);
      return false;
    }
  }

  interface GenerateVideoData {
    sessionId: String;
    effect: String;
  }

  async function generateVideo(data: GenerateVideoData): Promise<Blob> {
    try {
      const response = await axios.post(
        `${HOST_ADRESS}:8000/generate_video`,
        data,
        {
          responseType: "blob",
        }
      );

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error(
          "Error generating video:",
          error.response?.data || error.message
        );
      } else {
        console.error("Unexpected error:", error);
      }
      throw error;
    }
  }

  async function generateJSON() {
    const response = await axios.get(
      `${HOST_ADRESS}:8000/masks/${sessionIdRef.current}`,
    );
    return response.data;
  }

  async function handleDownloadJSON() {
    try {
      setLoading(true);

      // Fetch the JSON data
      const jsonData = await generateJSON();

      // Create a Blob from the JSON data
      const blob = new Blob([JSON.stringify(jsonData, null, 2)], {
        type: 'application/json',
      });

      // Create a URL for the Blob
      const url = window.URL.createObjectURL(blob);

      // Create a temporary anchor element
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'masks.json'; // Name of the downloaded file

      // Append the anchor to the body
      document.body.appendChild(a);

      // Programmatically click the anchor to trigger the download
      a.click();

      // Clean up by removing the anchor element and revoking the Blob URL
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setLoading(false);
    } catch (error) {
      console.error("Failed to download JSON:", error);
      setLoading(false);
    }
  }

  const handleTrackObjects = async () => {
    const processStream = async () => {
      currentFrame.current = 0;

      const response = await fetch(
        `${HOST_ADRESS}:8000/propagate_in_video/`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/x-ndjson",
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            start_frame_index: 0,
          }),
        }
      );
      if (!response.body) {
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        buffer += chunk;

        const jsonObjects = buffer.split('frameseparator');
        buffer = jsonObjects.pop() || "";  // Keep the last incomplete chunk in the buffer

        for (const jsonStr of jsonObjects) {
          if (jsonStr.trim()) {
            try {
              const frameData = JSON.parse(jsonStr);
              currentFrame.current = frameData.frameIndex;
              frameData.results.forEach((maskResult: any) => {
                detectionObjectList[maskResult.objectId].setOutput(
                  frameData.frameIndex,
                  maskResult.mask
                );
              });
              setDetectionObjectList([...detectionObjectList]);
              setNewClick(true);
              updateTimeIndicator(currentFrame.current);
              if (timeRef.current) {
                timeRef.current.textContent = formatTime(currentFrame.current);
              }
            } catch (error) {
              console.error("Error parsing frame JSON:", error);
            }
          }
        }
      }
    };
    setTrackingEnabled(false);
    setIsCurrentlyTracking(true);
    await processStream();
    setTrackingEnabled(true);
    setIsCurrentlyTracking(false);
    setHasTrackedAlready(true);
  };

  const maskColors = [
    "#4B7EEB",
    "#E6AD41",
    "#5FCFBE",
    "#F05A7E",
    "#AD49E1",
    "#387F39",
  ];

  const canAddNewObject =
    detectionObjectList.length < 6 &&
    (detectionObjectList.length === 0 ||
      Object.keys(detectionObjectList[detectionObjectList.length - 1].inputs)
        .length > 0);

  return (
    <Box px={5} pb={3} sx={{ height: "calc(100vh - 92px)", overflow: "auto" }}>
      <Grid container spacing={3} height="100%" mt={0}>
        <Grid
          item
          xl={3}
          lg={4}
          md={12}
          sx={{ pt: "0 !important", mb: { xs: 4, sm: 4, md: 4, lg: 0, xl: 0 } }}
        >
          <Card
            sx={{
              height: "100%",
              bgcolor: "rgb(26, 28, 31)",
              color: "white",
              display: "flex",
              flexDirection: "column",
              borderRadius: 5,
            }}
          >
            <CardContent sx={{ flexGrow: 1, p: 3, pt: 2 }}>
              <Box sx={{ mb: 2 }}>
                <Typography variant="h6" sx={{ fontWeight: "bold", my: 1 }}>
                  <Typography
                    sx={{
                      display: "inline-block",
                      background: "#fff",
                      color: "#000",
                      verticalAlign: "middle",
                      padding: "3px 10px 1px",
                      borderRadius: 5,
                      fontSize: 14,
                      fontWeight: 700,
                      mr: 1,
                      mt: -0.4,
                    }}
                  >
                    1/3
                  </Typography>{" "}
                  Select Objects
                </Typography>
                <Typography variant="body2" color="lightgrey" lineHeight={1.7}>
                  Adjust the selection of your object, or add additional
                  objects. Press "Track objects" to track your objects
                  throughout the video.
                </Typography>
              </Box>
              <Divider sx={{ my: 2.5, bgcolor: "rgba(255, 255, 255, 0.4)" }} />
              <Box
                sx={{
                  flexGrow: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Box
                  sx={{
                    flexGrow: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    height: "100%",
                    overflow: "hidden",
                    bgcolor: "rgba(255, 255, 255, 0.0)",
                  }}
                >
                  <Stack
                    spacing={2}
                    sx={{
                      width: "100%",
                    }}
                  >
                    {detectionObjectList.map((obj, index) => (
                      <Card
                        key={obj.objectId}
                        sx={{
                          p: 2,
                          width: "100%",
                          backgroundColor: "black",
                          borderRadius: 3,
                          cursor: "pointer",
                          border: "2px solid transparent",
                          borderColor:
                            index === activeObjectIdx ? "#7cd959" : "",
                          color: "white",
                          transition: "background-color 0.3s, color 0.3s",
                          "&:hover": {
                            borderColor: "#7cd959",
                          },
                        }}
                        onClick={() => setActiveObjectIdx(index)}
                      >
                        <Box
                          sx={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: 14,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              backgroundColor: obj.maskColor,
                              padding: "4px 10px",
                              borderRadius: 1.5,
                            }}
                          >
                            Object {obj.objectId}
                          </Typography>
                          <IconButton
                            onClick={() => removeDetectionObject(index)}
                            aria-label="delete"
                          >
                            <DeleteIcon color="error" fontSize="small" />
                          </IconButton>
                        </Box>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: "medium", mt: 1.2 }}
                        >
                          Inputs: {Object.keys(obj.inputs).length}, Outputs:{" "}
                          {Object.keys(obj.outputs).length}
                        </Typography>
                      </Card>
                    ))}
                    <Tooltip
                      title={
                        canAddNewObject
                          ? ""
                          : "Add at least one input to the current object before creating a new one"
                      }
                    >
                      <span>
                        <Button
                          variant="contained"
                          startIcon={<AddIcon />}
                          onClick={addDetectionObject}
                          fullWidth
                          disabled={!canAddNewObject}
                          sx={buttonStyles}
                        >
                          Add Detection Object
                        </Button>
                      </span>
                    </Tooltip>
                  </Stack>
                </Box>
              </Box>
            </CardContent>
            <Divider sx={{ bgcolor: "rgba(255, 255, 255, 0.12)" }} />
            <CardActions sx={{ justifyContent: "space-between", p: 3 }}>
              <Button
                variant="contained"
                onClick={handleTrackObjects}
                disabled={!trackingEnabled}
                sx={buttonStyles}
              >
                Track Objects
              </Button>
              <Button
                variant="contained"
                onClick={handleDownloadJSON}
                disabled={!hasTrackedAlready || isCurrentlyTracking}
                sx={buttonStyles}
              >
                Download
              </Button>
            </CardActions>
          </Card>
        </Grid>

        {/* Right side: Video player with timeline */}
        <Grid
          item
          xl={9}
          lg={8}
          md={12}
          sx={{
            display: "flex",
            justifyContent: "center",
            pt: "0 !important",
            width: "100%",
            mb: { xs: 4, sm: 4, md: 4, lg: 0, xl: 0 },
          }}
        >
          <Card
            sx={{
              borderRadius: 5,
              height: "100%",
              width: "100%",
              bgcolor: "rgb(26, 28, 31)",
            }}
          >
            <CardContent
              sx={{ height: "calc(100% - 120px)", boxSizing: "border-box" }}
            >
              <Box
                ref={boxRef}
                sx={{
                  position: "relative",
                  height: "100%", // Set height to 100% of the parent
                  maxWidth: "100%", // Ensure it doesn't exceed the parent's width
                  margin: "0 auto", // Center the box horizontally
                }}
              >
                {loading && (
                  <Typography
                    align="center"
                    color="white"
                    sx={{
                      display: "flex",
                      height: "100%",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <CircularProgress
                      sx={{ color: "#fff", mr: 1.5 }}
                      size={26}
                    />{" "}
                    Loading...
                  </Typography>
                )}
                <canvas
                  ref={videoCanvasRef}
                  style={{
                    position: "absolute",
                    width: "100%",
                    height: "auto",
                    top: 0,
                    left: 0,
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "10px",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                  }}
                  onClick={
                    isCurrentlyTracking
                      ? undefined
                      : (e) => handleVideoClick(e, 1)
                  }
                  onContextMenu={
                    isCurrentlyTracking
                      ? undefined
                      : (e) => handleVideoClick(e, 0)
                  }
                />
                <svg
                  ref={svgRef}
                  width={VIDEO_WIDTH}
                  height={VIDEO_HEIGHT}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    pointerEvents: "none",
                  }}
                >
                  {detectionObjectList.map((detectionObject, objectIndex) =>
                    detectionObject.inputs[currentFrame.current]?.points.map(
                      (point, pointIndex) => {
                        const [normalizedX, normalizedY] = point;
                        const x = normalizedX * VIDEO_WIDTH;
                        const y = normalizedY * VIDEO_HEIGHT;
                        const label =
                          detectionObject.inputs[currentFrame.current].labels[
                          pointIndex
                          ];
                        const markerId = `${objectIndex}-${pointIndex}`;

                        return (
                          <g
                            key={markerId}
                            style={{ pointerEvents: "auto" }}
                            onMouseEnter={() => setHoveredMarker(markerId)}
                            onMouseLeave={() => setHoveredMarker(null)}
                          >
                            <circle
                              cx={x}
                              cy={y}
                              r="10"
                              fill={label === 1 ? "black" : "red"}
                              stroke={"white"}
                            />
                            {label === 1 ? (
                              <>
                                <line
                                  x1={x - 5}
                                  y1={y}
                                  x2={x + 5}
                                  y2={y}
                                  stroke="white"
                                  strokeWidth="2"
                                />
                                <line
                                  x1={x}
                                  y1={y - 5}
                                  x2={x}
                                  y2={y + 5}
                                  stroke="white"
                                  strokeWidth="2"
                                />
                              </>
                            ) : (
                              <line
                                x1={x - 5}
                                y1={y}
                                x2={x + 5}
                                y2={y}
                                stroke="white"
                                strokeWidth="2"
                              />
                            )}
                            {hoveredMarker === markerId && (
                              <g
                                transform={`translate(${x + 5}, ${y - 10})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveInput(objectIndex, pointIndex);
                                }}
                                style={{ cursor: "pointer" }}
                              >
                                <circle
                                  r="6"
                                  fill="white"
                                  stroke="black"
                                  strokeWidth="1"
                                />
                                <line
                                  x1="-3"
                                  y1="-3"
                                  x2="3"
                                  y2="3"
                                  stroke="black"
                                  strokeWidth="1"
                                />
                                <line
                                  x1="3"
                                  y1="-3"
                                  x2="-3"
                                  y2="3"
                                  stroke="black"
                                  strokeWidth="1"
                                />
                              </g>
                            )}
                          </g>
                        );
                      }
                    )
                  )}
                </svg>
              </Box>
            </CardContent>
            <CardContent
              sx={{ height: "120px", boxSizing: "border-box", py: 0 }}
            >
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  mb: 2,
                }}
              >
                <Button
                  sx={buttonStyles}
                  variant="contained"
                  onClick={handlePlayPause}
                  disabled={isCurrentlyTracking}
                  startIcon={playing ? <PauseIcon /> : <PlayArrowIcon />}
                >
                  {playing ? "Pause" : "Play"}
                </Button>
                <Typography
                  ref={timeRef}
                  variant="body1"
                  sx={{ ml: 1, color: "white", minWidth: 60 }}
                  textAlign="center"
                >
                  00:00
                </Typography>
              </Box>
              <Box sx={{ textAlign: "center", overflow: "auto" }}>
                <canvas
                  ref={timelineCanvasRef}
                  width={window.innerWidth < 991 ? "" : TIMELINE_WIDTH}
                  height={TIMELINE_HEIGHT}
                  onClick={
                    isCurrentlyTracking ? undefined : handleTimelineClick
                  }
                  style={{
                    cursor: "pointer",
                    borderRadius: "40px",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
                  }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <InstructionPopup />
    </Box>
  );
};

export default VideoPlayer;

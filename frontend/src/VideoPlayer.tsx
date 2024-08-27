import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Card, CardContent, Button, Typography, Box, Divider, CardActions, IconButton, Stack, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import { DetectionObject } from './DetectionObject';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import { Timer } from '@mui/icons-material';

interface VideoPlayerProps {
  videoUrl: string;
}

const HOST_ADRESS = "http://ec2-3-120-34-7.eu-central-1.compute.amazonaws.com"


const VideoPlayer: React.FC<VideoPlayerProps> = ({ videoUrl }) => {
  useEffect(() => {
    console.log("Init");
  }, []);
  const videoCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const timelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isPlaying = useRef<boolean>(false);
  const currentFrame = useRef<number>(0);
  const sessionIdRef = useRef<String>("");
  const effectRan = useRef(false);
  const [detectionObjectList, setDetectionObjectList] = useState<DetectionObject[]>([]);
  const [activeObjectIdx, setActiveObjectIdx] = useState(0);
  const [newClick, setNewClick] = useState<boolean>(false);
  const [hoveredMarker, setHoveredMarker] = useState<string | null>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const [trackingEnabled, setTrackingEnabled] = useState<boolean>(false);
  const [isCurrentlyTracking, setIsCurrentlyTracking] = useState<boolean>(false);
  const [hasTrackedAlready, setHasTrackedAlready] = useState<boolean>(false);


  const addDetectionObject = () => {
    setDetectionObjectList([...detectionObjectList, new DetectionObject(maskColors[detectionObjectList.length])]);
    setActiveObjectIdx(detectionObjectList.length);
  };

  const removeDetectionObject = (index: number) => {
    const newList = detectionObjectList.filter((_, i) => i !== index);
    setDetectionObjectList(newList);
    if (activeObjectIdx >= newList.length) {
      setActiveObjectIdx(newList.length - 1);
    }
  };

  const [currentStep, setCurrentStep] = useState(1);

  const VIDEO_WIDTH = 1280;
  const VIDEO_HEIGHT = 720;
  const TIMELINE_WIDTH = 900;
  const TIMELINE_HEIGHT = 50;
  const TOTAL_FRAMES = 240;
  const FPS = 24;


  interface ImageObject {
    id: number;
    src: string;
  }

  const [images, setImages] = useState<ImageObject[]>([]);

  useEffect(() => {
    if (newClick) {
      console.log("drawing frame");
      drawFrame(currentFrame.current);
      //drawMasks();
      setNewClick(false);
    }
  }, [detectionObjectList, newClick])



  const drawFrame = useCallback((frameIdx: number) => {
    console.log("drawing video");
    if (images.length > frameIdx) {
      const canvas = videoCanvasRef.current;

      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const img = new Image();
          img.onload = () => {
            requestAnimationFrame(() => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx.drawImage(img, 0, 0);
              console.log("Image drawn successfully");
              console.log("drawing mask", detectionObjectList);

              detectionObjectList.forEach((detectionObject) => {
                if (currentFrame.current in detectionObject.outputs) {
                  const maskObj = detectionObject.outputs[currentFrame.current].rleMasks;
                  const binary_mask = decodeColumnwiseCocoRLE(maskObj.size, maskObj.counts);

                  if (videoCanvasRef.current) {
                    drawBinaryMaskOnCanvas(binary_mask, videoCanvasRef.current, detectionObject.maskColor, ctx);
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
  }, [images, detectionObjectList]);

  const drawTimeline = () => {
    const canvas = timelineCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, TIMELINE_WIDTH, TIMELINE_HEIGHT);
        for (let i = 0; i < TOTAL_FRAMES; i++) {
          const x = (i / TOTAL_FRAMES) * TIMELINE_WIDTH;
          ctx.fillStyle = i % FPS === 0 ? '#888' : '#ccc';
          ctx.fillRect(x, 0, 1, TIMELINE_HEIGHT);
        }
      }
    }
  };

  const updateTimeIndicator = (frame: number) => {
    const canvas = timelineCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, TIMELINE_WIDTH, TIMELINE_HEIGHT);
        drawTimeline();
        const x = (frame / TOTAL_FRAMES) * TIMELINE_WIDTH;
        ctx.fillStyle = 'red';
        ctx.fillRect(x - 1, 0, 2, TIMELINE_HEIGHT);
      }
    }
  };

  const playVideo = useCallback(() => {
    console.log("playing");
    let lastTimestamp: number | null = null;
    const frameDuration = 1000 / 24; // 24 fps

    const animate = (timestamp: number) => {
      if (!isPlaying.current) return;
      if (lastTimestamp === null || timestamp - lastTimestamp >= frameDuration) {
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
    isPlaying.current = !isPlaying.current
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
    const hasInputs = detectionObjectList.some(obj => Object.keys(obj.inputs).length > 0);

    if (!hasInputs) {
      setTrackingEnabled(false);
    }
  }, [detectionObjectList]);

  const formatTime = (frame: number) => {
    console.log("formatting");
    const totalSeconds = Math.floor(frame / FPS);
    const seconds = totalSeconds % 60;
    const frames = frame % FPS;
    return `${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (effectRan.current === false) {

      const createSession = async () => {
        console.log('createSession called');
        sessionIdRef.current = '';

        try {
          const response = await axios.post(`${HOST_ADRESS}:8000/create_session/`, {
            s3_link: videoUrl
          });
          console.log(response);
          sessionIdRef.current = response.data.session_id;
          // Process and save the received images
          const newImages = response.data.frames.map((frame: string, index: number) => ({
            id: index,
            src: `data:image/jpeg;base64,${frame}`
          }));
          setImages(newImages);
        } catch (err) {
          console.error('Failed to create session:', err);
        }
      };
      drawTimeline();
      createSession();
      //addDetectionObject();

      effectRan.current = true;
    }


  }, []);

  useEffect(() => {
    console.log("drawing init");
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
          const index = (pixelPosition % rows) * cols + Math.floor(pixelPosition / rows);
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
    hex = hex.replace(/^#/, '');

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
    color: string = 'rgba(255, 0, 0, 0.5)',
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
    detectionObjectList[objectIndex].inputs[currentFrame.current].points.splice(pointIndex, 1);
    detectionObjectList[objectIndex].inputs[currentFrame.current].labels.splice(pointIndex, 1);

    if (detectionObjectList[objectIndex].inputs[currentFrame.current].labels.length === 0) {
      delete detectionObjectList[objectIndex].inputs[currentFrame.current];
      detectionObjectList[objectIndex].removeOutput(currentFrame.current)
    } else {

      const currentDetection = detectionObjectList[objectIndex];
      const payload = {
        sessionId: sessionIdRef.current,
        frameIndex: currentFrame.current,
        objectId: currentDetection.objectId,
        labels: currentDetection.inputs[currentFrame.current].labels,
        points: currentDetection.inputs[currentFrame.current].points,
        clearOldPoints: true,
        resetState: true
      }

      const response = await axios.post(`${HOST_ADRESS}:8000/add_new_points/`, payload);
      console.log(response);
      console.log(detectionObjectList);
      response.data.addPoints.rleMaskList.forEach((maskObj: any) => {
        const objectId = maskObj.objectId;
        detectionObjectList[objectId].setOutput(currentFrame.current, maskObj.rleMask);
      })
    }
    setDetectionObjectList([...detectionObjectList]);
    setNewClick(true);
  };

  const handleVideoClick = async (event: React.MouseEvent<HTMLCanvasElement>, label: number) => {
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
      currentDetection.addInput(currentFrame.current, label, [normalizedX, normalizedY])

      const payload = {
        sessionId: sessionIdRef.current,
        frameIndex: currentFrame.current,
        objectId: currentDetection.objectId,
        labels: currentDetection.inputs[currentFrame.current].labels,
        points: currentDetection.inputs[currentFrame.current].points,
        clearOldPoints: true,
        resetState: false
      }

      const response = await axios.post(`${HOST_ADRESS}:8000/add_new_points/`, payload);
      console.log(response);
      response.data.addPoints.rleMaskList.forEach((maskObj: any) => {
        const objectId = maskObj.objectId;
        detectionObjectList[objectId].setOutput(currentFrame.current, maskObj.rleMask);
      })

      setNewClick(true);
      setDetectionObjectList([...detectionObjectList]);
      // Log the click information
      console.log('Click registered:', {
        normalizedPosition: { x: normalizedX, y: normalizedY },
        frameIdx: currentFrame.current
      });

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
      return false;
    }
  }
  
  interface GenerateVideoData {
    sessionId: String;
    effect: String;
  }

  async function generateVideo(data: GenerateVideoData): Promise<Blob> {
    try {
      const response =  await axios.post(`${HOST_ADRESS}:8000/generate_video`, data, {
        responseType: 'blob',
      });
  
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        console.error('Error generating video:', error.response?.data || error.message);
      } else {
        console.error('Unexpected error:', error);
      }
      throw error;
    }
  }

  async function handleDownloadVideo() {
    try {
      const videoBlob = await generateVideo({
        sessionId: sessionIdRef.current,
        effect: 'remove_background'
      });
  
      // Create a URL for the blob
      const videoUrl = URL.createObjectURL(videoBlob);
  
      // Function to trigger download
      const downloadVideo = () => {
        const a = document.createElement('a');
        a.href = videoUrl;
        a.download = 'generated_video.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      };
  

      downloadVideo();
      
  
    } catch (error) {
      console.error('Failed to generate video:', error);
    }
  }


  const handleTrackObjects = async () => {
    const processStream = async () => {
      currentFrame.current = 0;

      try {
        const response = await fetch(`${HOST_ADRESS}:8000/propagate_in_video/`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'multipart/x-savi-stream'
          },
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            start_frame_index: 0
          }),
        });
        if (!response.body) {
          return;
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();


        let buffer = ""
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const first100 = chunk.slice(0, 100);
          const last100 = chunk.slice(-100);
          buffer += chunk;

          if (isValidJSON(buffer)) {
            try {
              const frameData = JSON.parse(buffer);
              currentFrame.current = frameData.frameIndex;
              frameData.results.forEach((maskResult: any) => {
                detectionObjectList[maskResult.objectId].setOutput(frameData.frameIndex, maskResult.mask);
              });
              setDetectionObjectList([...detectionObjectList]);
              setNewClick(true);
              updateTimeIndicator(currentFrame.current);
              if (timeRef.current) {
                timeRef.current.textContent = formatTime(currentFrame.current);
              }
              console.log('Received frame:', frameData);
              // Process the frame data as needed
            } catch (error) {
              console.error('Error parsing frame JSON:', error);
            }
            buffer = "";
          }
        }
      } catch (error) {
        console.error('Error processing stream:', error);
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
    "#387F39"
  ]

  const canAddNewObject = detectionObjectList.length < 6 && (detectionObjectList.length === 0 || Object.keys(detectionObjectList[detectionObjectList.length - 1].inputs).length > 0);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'black' }}>
      <Box sx={{ width: '33%', p: 2 }}>
        <Card sx={{
          height: '100%',
          bgcolor: 'rgb(26, 28, 31)',
          color: 'white',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <CardContent sx={{ flexGrow: 1 }}>
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" color="lightgrey">
                1/3
              </Typography>
              <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1 }}>
                Select Objects
              </Typography>
              <Typography variant="body2" color="lightgrey">
                Adjust the selection of your object, or add additional objects. Press "Track objects" to track your objects throughout the video.
              </Typography>
            </Box>
            <Divider sx={{ my: 2, bgcolor: 'rgba(255, 255, 255, 0.12)' }} />
            <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', overflow: 'hidden', bgcolor: 'rgba(255, 255, 255, 0.0)' }}>
                <Stack
                  spacing={2}
                  sx={{
                    width: '100%',
                    maxWidth: 600,
                    maxHeight: '80vh',
                    overflowY: 'auto',
                    padding: 2,
                  }}
                >
                  {detectionObjectList.map((obj, index) => (
                    <Card
                      key={obj.objectId}
                      sx={{
                        width: '100%',
                        backgroundColor: index === activeObjectIdx ? 'black' : 'grey.300',
                        color: index === activeObjectIdx ? 'white' : 'black',
                        transition: 'background-color 0.3s, color 0.3s',
                        '&:hover': {
                          backgroundColor: index === activeObjectIdx ? 'black' : 'grey.400',
                        },
                      }}
                      onClick={() => setActiveObjectIdx(index)}
                    >
                      <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Typography variant="h6" sx={{ fontWeight: 'bold', color: obj.maskColor }}>
                            Object {obj.objectId}
                          </Typography>
                          <IconButton
                            onClick={() => removeDetectionObject(index)}
                            aria-label="delete"
                            sx={{ color: 'inherit' }}
                          >
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 'medium' }}>
                          Inputs: {Object.keys(obj.inputs).length}, Outputs: {Object.keys(obj.outputs).length}
                        </Typography>
                      </CardContent>
                    </Card>
                  ))}
                  <Tooltip title={canAddNewObject ? "" : "Add at least one input to the current object before creating a new one"}>
                    <span>
                      <Button
                        variant="contained"
                        startIcon={<AddIcon />}
                        onClick={addDetectionObject}
                        fullWidth
                        disabled={!canAddNewObject}
                        sx={{
                          backgroundColor: 'primary.main',
                          color: 'white',
                          fontWeight: 'bold',
                          '&:hover': {
                            backgroundColor: 'primary.dark',
                          },
                          '&.Mui-disabled': {
                            backgroundColor: 'action.disabledBackground',
                            color: 'action.disabled',
                          },
                        }}
                      >
                        Add Detection Object
                      </Button>
                    </span>
                  </Tooltip>
                </Stack>
              </Box>
            </Box>
          </CardContent>
          <Divider sx={{ bgcolor: 'rgba(255, 255, 255, 0.12)' }} />
          <CardActions sx={{ justifyContent: 'space-between', p: 2 }}>
            <Button
              variant="contained"
              onClick={handleTrackObjects}
              disabled={!trackingEnabled}
            >
              Track Objects
            </Button>
            <Button
              variant="contained"
              onClick={handleDownloadVideo}
              disabled={!hasTrackedAlready || isCurrentlyTracking}
            >
              Download
            </Button>
          </CardActions>
        </Card>
      </Box>

      {/* Right side: Video player with timeline */}
      <Box sx={{ width: '67%', p: 2, display: 'flex', justifyContent: 'center' }}>
        <Card sx={{ height: '100%', width: 'fit-content', bgcolor: 'rgb(26, 28, 31)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <CardContent sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <Box sx={{ width: VIDEO_WIDTH, height: VIDEO_HEIGHT, mb: 2, position: 'relative' }}>
              <canvas
                ref={videoCanvasRef}
                width={VIDEO_WIDTH}
                height={VIDEO_HEIGHT}
                style={{ border: '1px solid #ccc', borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                onClick={isCurrentlyTracking ? undefined : (e) => handleVideoClick(e, 1)}
                onContextMenu={isCurrentlyTracking ? undefined : (e) => handleVideoClick(e, 0)}
              />
              <svg
                ref={svgRef}
                width={VIDEO_WIDTH}
                height={VIDEO_HEIGHT}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none'
                }}
              >
                {detectionObjectList.map((detectionObject, objectIndex) => (
                  detectionObject.inputs[currentFrame.current]?.points.map((point, pointIndex) => {
                    const [normalizedX, normalizedY] = point;
                    const x = normalizedX * VIDEO_WIDTH;
                    const y = normalizedY * VIDEO_HEIGHT;
                    const label = detectionObject.inputs[currentFrame.current].labels[pointIndex];
                    const markerId = `${objectIndex}-${pointIndex}`;

                    return (
                      <g
                        key={markerId}
                        style={{ pointerEvents: 'auto' }}
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
                            <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke="white" strokeWidth="2" />
                            <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="white" strokeWidth="2" />
                          </>
                        ) : (
                          <line x1={x - 5} y1={y} x2={x + 5} y2={y} stroke="white" strokeWidth="2" />
                        )}
                        {hoveredMarker === markerId && (
                          <g
                            transform={`translate(${x + 5}, ${y - 10})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveInput(objectIndex, pointIndex);
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            <circle r="6" fill="white" stroke="black" strokeWidth="1" />
                            <line x1="-3" y1="-3" x2="3" y2="3" stroke="black" strokeWidth="1" />
                            <line x1="3" y1="-3" x2="-3" y2="3" stroke="black" strokeWidth="1" />
                          </g>
                        )}
                      </g>
                    );
                  })
                ))}
              </svg>
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
              <Button
                variant="contained"
                onClick={handlePlayPause}
                disabled={isCurrentlyTracking}
                startIcon={isPlaying.current ? <PauseIcon /> : <PlayArrowIcon />}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </Button>
              <Typography
                ref={timeRef}
                variant="body1"
                sx={{ ml: 2, color: 'white' }}
              />
            </Box>
            <Box sx={{ width: TIMELINE_WIDTH, height: TIMELINE_HEIGHT }}>
              <canvas
                ref={timelineCanvasRef}
                width={TIMELINE_WIDTH}
                height={TIMELINE_HEIGHT}
                onClick={isCurrentlyTracking ? undefined : handleTimelineClick}
                style={{ cursor: 'pointer', borderRadius: '4px', boxShadow: '0 1px 2px rgba(0,0,0,0.1)' }}
              />
            </Box>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};

export default VideoPlayer;
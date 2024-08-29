import React from "react";
import VideoPlayer from "./VideoPlayer";
import { Box, Typography } from "@mui/material";
import { getImageUrl } from "./components/utils/getPaths";
import "./App.css";
import Header from "./components/shared/Header";

const App: React.FC = () => {
  return (
    <div className="App">
      <Box sx={{ minHeight: "100vh", bgcolor: "black" }}>
        <Header />
        <VideoPlayer videoUrl="https://d3i3vmc3ecazz7.cloudfront.net/cyber_meta.mp4" />
      </Box>
    </div>
  );
};

export default App;

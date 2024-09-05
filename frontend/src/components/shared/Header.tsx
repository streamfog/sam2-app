import { Box, Typography } from "@mui/material";
import React from "react";
import { getImageUrl } from "../utils/getPaths";

const Header = () => {
  return (
    <Box sx={{ px: 5, py: 3 }}>
      <Box sx={{ position: "relative" }}>
        <Typography
          sx={{
            position: "absolute",
            left: 0,
            bottom: -6,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 2.8,
            opacity: 1,
          }}
        >
          Segment Anything 2 Demo
        </Typography>
      </Box>
    </Box>
  );
};

export default Header;

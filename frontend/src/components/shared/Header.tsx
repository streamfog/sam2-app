import { Box, Typography } from "@mui/material";
import React from "react";
import { getImageUrl } from "../utils/getPaths";

const Header = () => {
  return (
    <Box sx={{ px: 5, py: 3 }}>
      <Box sx={{ position: "relative" }}>
        <img
          src={getImageUrl("app-logo-with-name.png")}
          style={{ maxWidth: 280 }}
        />
        <Typography
          sx={{
            position: "absolute",
            left: 105,
            bottom: -6,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 2.8,
            opacity: 1,
          }}
        >
          Segment Anything
        </Typography>
      </Box>
    </Box>
  );
};

export default Header;

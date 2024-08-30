import React, { useEffect, useState } from "react";
import {
  Modal,
  Box,
  Button,
  Typography,
  List,
  ListItem,
  ListItemText,
  Divider,
} from "@mui/material";
import moment from "moment";
import { buttonStyles } from "../../VideoPlayer";

const instructions = [
  "You can select objects by left click of the mouse.",
  "You can remove any part of selected object by right click of the mouse.",
  "You can deselect the object by clicking close icon on (+) symbol on selected object.",
  "After selecting object, click on 'Track Object' button to start tracking and segmenting objects.",
];

export default function InstructionPopup() {
  const [open, setOpen] = useState(false);

  const handleClose = () => {
    localStorage.setItem("ipt", JSON.stringify(moment()));
    setOpen(false);
  };

  useEffect(() => {
    const instructionPopupTime = localStorage.getItem("ipt");
    if (instructionPopupTime) {
      const parsedTime = JSON.parse(instructionPopupTime);
      if (moment(parsedTime).isAfter(moment().add(2, "hours"))) {
        localStorage.removeItem("ipt");
        setOpen(true);
      }
    } else {
      setOpen(true);
    }
  }, []);

  return (
    <div>
      <Modal
        open={open}
        aria-labelledby="modal-title"
        aria-describedby="modal-description"
        sx={{ backdropFilter: "blur(10px)" }}
      >
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: 400,
            bgcolor: "#000",
            boxShadow: 24,
            borderRadius: 4,
            p: 4,
          }}
        >
          <Typography
            id="modal-title"
            variant="h6"
            component="h2"
            fontWeight={700}
          >
            Instructions to Segment
          </Typography>
          <Divider
            sx={{ borderBottomColor: "rgba(255, 255, 255, 1)", mt: 2, mb: 0.5 }}
          />
          <Typography id="modal-description">
            <List
              sx={{
                listStyleType: "number", // Set the list style to 'disc' for bullets
                paddingLeft: 2, // Add padding for bullets
                "& .MuiListItem-root": {
                  display: "list-item", // Ensure each item behaves like a list item
                },
              }}
            >
              {instructions.map((item, index) => (
                <ListItem
                  key={index}
                  sx={{ display: "list-item", paddingLeft: 0 }}
                >
                  <ListItemText>
                    <Typography variant="body1">{item}</Typography>
                  </ListItemText>
                </ListItem>
              ))}
            </List>
          </Typography>
          <Button
            variant="contained"
            sx={{ ...buttonStyles, width: "100%", mt: 1 }}
            onClick={handleClose}
          >
            Close
          </Button>
        </Box>
      </Modal>
    </div>
  );
}

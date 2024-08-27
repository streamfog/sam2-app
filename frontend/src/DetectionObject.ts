export class DetectionObject {
    private static nextId: number = 0;
    objectId: number;
    maskColor: string;
    inputs: {
      [frameIdx: number]: {
        labels: number[];
        points: [number, number][];
      };
    } = {};
    outputs: {
      [frameIdx: number]: {
        rleMasks: any;
      };
    } = {};
  
    constructor(maskColor: string) {
      this.objectId = DetectionObject.nextId++;
      this.maskColor = maskColor;
      console.log("new object");
    }
  
    addInput(frameIdx: number, label: number, point: [number, number]) {

      if (!this.inputs[frameIdx]) {
        this.inputs[frameIdx] = {labels: [], points: []};
      }
      this.inputs[frameIdx].labels.push(label);
      this.inputs[frameIdx].points.push(point);
    }

    removeOutput(frameIdx: number) {
      delete this.outputs[frameIdx];
    }

    setOutput(frameIdx: number, rleMasks: [number][]) {

      if (!this.outputs[frameIdx]) {
        this.outputs[frameIdx] = {rleMasks: []};
      }
      this.outputs[frameIdx].rleMasks = rleMasks;
    }

   
  }
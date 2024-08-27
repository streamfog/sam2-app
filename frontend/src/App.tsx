import React from 'react';
import VideoPlayer from './VideoPlayer';

const App: React.FC = () => {
  return (
    <div className="App">
      <VideoPlayer videoUrl="https://d3i3vmc3ecazz7.cloudfront.net/cyber_meta.mp4" />
    </div>
  );
};

export default App;
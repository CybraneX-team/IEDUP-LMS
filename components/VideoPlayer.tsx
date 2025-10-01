import React from 'react';

interface VideoPlayerProps {
  src: string;
  type?: string;
  width?: string | number;
  height?: string | number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, type = 'video/webm', width = '100%', height = 360 }) => {
  return (
    <video
      controls
      preload="auto"
      crossOrigin="anonymous"
      width={width}
      height={height}
      style={{ borderRadius: 8, background: '#000' }}
    >
      <source src={src} type={type} />
      Your browser does not support the video tag.
    </video>
  );
};

export default VideoPlayer;

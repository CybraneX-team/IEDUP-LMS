'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import VideoPlayer from './VideoPlayer';
import {
  FaPlay,
  FaDownload,
  FaClock,
  FaCalendarAlt,
  FaSpinner,
  FaExclamationTriangle,
  FaVideo,
  FaHdd,
  FaTimes
} from 'react-icons/fa';

const RecordingsList = () => {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [playingVideo, setPlayingVideo] = useState(null);

  useEffect(() => {
    fetchRecordings();
  }, []);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/recordings/list');
      const data = await response.json();

      if (response.ok) {
        setRecordings(data.recordings || []);
        setSummary(data.summary || null);
      } else {
        setError(data.error || 'Failed to fetch recordings');
      }
    } catch (err) {
      setError('Error loading recordings');
      console.error('Error fetching recordings:', err);
    } finally {
      setLoading(false);
    }
  };
  const formatDate = (timestampMs) => {
    if (!timestampMs) return 'Unknown';
    const date = new Date(timestampMs);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return 'Unknown';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  };

  const handlePlayInline = async (recording) => {
    try {
      if (!recording.key) {
        throw new Error('Recording key is unavailable');
      }
      setPlayingVideo({
        ...recording,
        url: `/api/recordings/stream?key=${encodeURIComponent(recording.key)}`,
        contentType: recording.contentType || `video/${recording.format || 'mp4'}`
      });
    } catch (err) {
      console.error('Error loading video:', err);
      alert('Failed to load video. Please try again.');
    }
  };

  const closeVideoPlayer = () => {
    if (playingVideo?.url) {
      window.URL.revokeObjectURL(playingVideo.url);
    }
    setPlayingVideo(null);
  };

  const handleDownload = async (key, filename) => {
    try {
      if (!key) {
        throw new Error('Recording key is unavailable');
      }
      const link = document.createElement("a");
      link.href = `/api/recordings/download?key=${encodeURIComponent(key)}`;
      link.download = filename || "recording.mp4"; // Browser uses this
      document.body.appendChild(link);

      // Simulate user click
      link.click();

      // Cleanup
      document.body.removeChild(link);

    } catch (err) {
      console.error("Error downloading recording:", err);
      alert("Failed to download recording. Please try again.");
    }
  };


  const itemVariants = {
    initial: { y: 20, opacity: 0 },
    animate: {
      y: 0,
      opacity: 1,
      transition: {
        type: "spring",
        stiffness: 100
      }
    },
    exit: {
      y: -20,
      opacity: 0,
      transition: { duration: 0.2 }
    },
    hover: {
      y: -2,
      transition: { duration: 0.2 }
    }
  };

  if (loading) {
    return (
      <motion.div
        className="recordings-loading"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <FaSpinner className="spinner" />
        <p>Loading recordings...</p>
      </motion.div>
    );
  }

  if (error) {
    return (
      <motion.div
        className="recordings-error"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <FaExclamationTriangle />
        <p>{error}</p>
        <button onClick={fetchRecordings} className="retry-button">
          Try Again
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="recordings-section"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
    >
      <motion.h2
        className="section-title"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        Meeting Recordings
      </motion.h2>

      {/* Summary Stats */}
      {summary && (
        <motion.div
          className="recordings-summary"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <div className="summary-stat">
            <FaVideo />
            <span>{recordings.length} Recording{recordings.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="summary-stat">
            <FaHdd />
            <span>{formatFileSize(summary.totalSizeBytes || 0)}</span>
          </div>
          <div className="summary-stat">
            <FaClock />
            <span>{formatDuration(summary.totalDurationSeconds || 0)}</span>
          </div>
        </motion.div>
      )}

      {recordings.length === 0 ? (
        <motion.div
          className="empty-recordings"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <FaPlay size={48} />
          <h3>No recordings yet</h3>
          <p>Your meeting recordings will appear here after you record a meeting.</p>
        </motion.div>
      ) : (
        <motion.div
          className="recordings-list"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <AnimatePresence>
            {recordings.map((recording, index) => (
              <motion.div
                key={recording.id}
                className="recording-item"
                variants={itemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                whileHover="hover"
                custom={index}
              >
                <div className="recording-info">
                  <div className="recording-header">
                    <h3>{recording.name.startsWith("recordings/") ? recording.name.split("/")[1] : recording.name || 'Untitled Recording'}</h3>
                    <span className="recording-date">
                      <FaCalendarAlt />
                      {formatDate(recording.startedAtMs)}
                    </span>
                  </div>

                  <div className="recording-details">
                    <span className="recording-room">
                      <FaVideo />
                      {recording.roomName}
                    </span>
                    {recording.sizeBytes ? (
                      <span className="recording-size">
                        <FaHdd />
                        {formatFileSize(recording.sizeBytes)}
                      </span>
                    ) : null}
                    {recording.durationSeconds ? (
                      <span className="recording-duration">
                        <FaClock />
                        {formatDuration(recording.durationSeconds)}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="recording-actions">
                  <motion.button
                    className="action-btn play-btn"
                    onClick={() => handlePlayInline(recording)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Play recording"
                  >
                    <FaPlay />
                    Play
                  </motion.button>

                  <motion.button
                    className="action-btn download-btn"
                    onClick={() => handleDownload(recording.key, recording.filename || `${recording.name || 'recording'}.${recording.format || 'mp4'}`)}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    title="Download recording"
                  >
                    <FaDownload />
                    Download
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Video Player Modal */}
      <AnimatePresence>
        {playingVideo && (
          <motion.div
            className="video-modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeVideoPlayer}
          >
            <motion.div
              className="video-modal-content"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="video-modal-header">
                <h3>{playingVideo.name || 'Recording Playback'}</h3>
                <button className="close-btn" onClick={closeVideoPlayer}>
                  <FaTimes />
                </button>
              </div>

              <div className="video-player-container">
                <VideoPlayer
                  src={playingVideo.url}
                  type={playingVideo.contentType}
                  width="100%"
                  height={400}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default RecordingsList; 

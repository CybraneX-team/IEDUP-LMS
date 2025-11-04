'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { generateRoomId, encodePassphrase, randomString } from '@/lib/client-utils';
import { fetchMeetings, createMeeting, updateMeeting } from '@/lib/api';
import DashboardBackground from './DashboardBackground';
import DashboardIllustration from './DashboardIllustration';
import RecordingsList from './RecordingsList';
import { 
  FaHome, 
  FaCalendarAlt, 
  FaHistory, 
  FaVideo, 
  FaUserFriends,
  FaPlus,
  FaLink,
  FaPlay,
  FaDownload,
  FaEllipsisH,
  FaTimes,
  FaMicrophone,
  FaUser,
  FaUsers,
  FaClock,
  FaCalendar,
  FaEdit
} from 'react-icons/fa';

// Animation variants
const pageVariants = {
  initial: { opacity: 0 },
  animate: { 
    opacity: 1,
    transition: { 
      duration: 0.5,
      when: "beforeChildren",
      staggerChildren: 0.1
    }
  },
  exit: { 
    opacity: 0,
    transition: { duration: 0.3 }
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
    y: -5,
    transition: { duration: 0.2 }
  }
};

const EnhancedDashboard = () => {
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState('');
  const [currentDate, setCurrentDate] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [meetingLink, setMeetingLink] = useState('');
  const [meetingTitle, setMeetingTitle] = useState('');
  const [meetingDescription, setMeetingDescription] = useState('');
  const [meetingDateTime, setMeetingDateTime] = useState('');
  const [meetingDuration, setMeetingDuration] = useState('1 hour');
  const [activeSection, setActiveSection] = useState('home');
  const [scheduledMeetings, setScheduledMeetings] = useState([]);
  const [pastMeetings, setPastMeetings] = useState([]);
  const [recordings, setRecordings] = useState([]);
  const [showToast, setShowToast] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [recordingStatus, setRecordingStatus] = useState({
    isRecording: false,
    recordingName: '',
    hostName: '',
    timestamp: null
  });

  // Inline edit state for meeting title
  const [editingMeetingId, setEditingMeetingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');


  
  // Set current time
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      }));
      
      setCurrentDate(now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }));
      
      // Default meeting time (now + 1 hour)
      const futureTime = new Date(now.getTime() + 60 * 60 * 1000);
      setMeetingDateTime(futureTime.toISOString().slice(0, 16));
    };
    
    updateTime();
    const interval = setInterval(updateTime, 60000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Load meetings from MongoDB
  const loadMeetings = async () => {
    try {
      const response = await fetchMeetings();
      if (response.success) {
        setScheduledMeetings(response.data.upcoming);
        setPastMeetings(response.data.past);
      } else {
        console.error('Failed to fetch meetings:', response.error);
      }
    } catch (error) {
      console.error('Error loading meetings:', error);
    }
  };

  useEffect(() => {
    loadMeetings();
  }, []);
  


  // Periodically refresh meetings from database
  useEffect(() => {
    const interval = setInterval(loadMeetings, 5 * 60 * 1000); // Refresh every 5 minutes
    return () => clearInterval(interval);
  }, []);
  
  // Handle sidebar navigation
  const handleNavigation = (section) => {
    setActiveSection(section);
  };

  // Begin editing a meeting title
  const beginEditTitle = (meeting) => {
    setEditingMeetingId(meeting.id);
    setEditingTitle(meeting.title || '');
  };

  // Cancel editing
  const cancelEditTitle = () => {
    setEditingMeetingId(null);
    setEditingTitle('');
  };

  // Save edited title to DB
  const saveEditedTitle = async () => {
    if (!editingMeetingId) return;
    const trimmed = (editingTitle || '').trim();
    if (!trimmed) return;
    try {
      const res = await updateMeeting({ id: editingMeetingId, title: trimmed });
      if (res.success) {
        await loadMeetings();
        setToastMessage('Meeting title updated');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 2500);
        cancelEditTitle();
      } else {
        setToastMessage(res.error || 'Failed to update meeting');
        setShowToast(true);
        setTimeout(() => setShowToast(false), 3000);
      }
    } catch (e) {
      console.error('Update meeting error', e);
      setToastMessage('Error updating meeting');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
    }
  };
  
  // Handle start new meeting
  const handleNewMeeting = () => {
    setModalType('start');
    setShowModal(true);
  };
  
  // Handle join meeting
  const handleJoinMeeting = () => {
    setModalType('join');
    setShowModal(true);
    setMeetingLink('');
  };
  
  // Handle schedule meeting
  const handleScheduleMeeting = () => {
    setModalType('schedule');
    setShowModal(true);
    setMeetingTitle('');
    setMeetingDescription('');
    setMeetingDuration('1 hour');
    
    // Set default date time (current time + 1 hour) in LOCAL for input
    const now = new Date();
    const futureTime = new Date(now.getTime() + 60 * 60 * 1000);
    setMeetingDateTime(toLocalInputString(futureTime));
  };
  
  // Start an instant meeting
  const startMeeting = () => {
    const newRoomId = generateRoomId();
    setShowModal(false);
    router.push(`/rooms/${newRoomId}$dashboard`);
  };
  
  // Join a meeting with link
  const joinMeeting = () => {
    if (!meetingLink) return;
    
    // Extract meeting ID from link if needed
    let meetingId = meetingLink;
    if (meetingLink.includes('/')) {
      const parts = meetingLink.split('/');
      meetingId = parts[parts.length - 1];
    }
    
    setShowModal(false);
    router.push(`/rooms/${meetingId}$dashboard`);
  };
  
  // Schedule a meeting
  const scheduleMeeting = async () => {
    if (!meetingTitle || !meetingDateTime) {
      setToastMessage("Please fill in all required fields");
      setShowToast(true);
      setTimeout(() => setShowToast(false), 3000);
      return;
    }

    try {
      const response = await createMeeting({
        title: meetingTitle,
        description: meetingDescription,
        // Convert local datetime-local value to ISO (UTC) for storage
        date: new Date(meetingDateTime).toISOString(),
        duration: meetingDuration
      });

      if (response.success) {
        // Reload meetings from database
        await loadMeetings();
        
        setShowModal(false);
        
        // Reset form
        setMeetingTitle('');
        setMeetingDescription('');
        setMeetingDuration('1 hour');
        setMeetingDateTime('');
        
        // Switch to upcoming view
        setActiveSection('upcoming');
        
        // Show success message
        setToastMessage(`Meeting "${meetingTitle}" scheduled successfully!`);
        setShowToast(true);
      } else {
        setToastMessage(response.error || 'Failed to schedule meeting');
        setShowToast(true);
      }
    } catch (error) {
      console.error('Error scheduling meeting:', error);
      setToastMessage('Error scheduling meeting');
      setShowToast(true);
    }
    
    // Hide toast after 4 seconds
    setTimeout(() => {
      setShowToast(false);
    }, 4000);
  };
  
  // Handle personal room
  const openPersonalRoom = () => {
    const personalRoomId = 'personal-' + Date.now();
    router.push(`/rooms/${personalRoomId}$dashboard`);
  };
  
  // Format date for display
  const formatDate = (dateString) => {
    const options = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Convert a Date to yyyy-MM-ddTHH:mm in LOCAL time for datetime-local inputs
  function toLocalInputString(date) {
    const pad = (n) => String(n).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }
  
  // Calculate meeting duration (time between now and meeting date)
  const calculateDuration = (meetingDate) => {
    const start = new Date(meetingDate);
    const end = new Date();
    const diff = Math.abs(end - start);
    const minutes = Math.floor(diff / (1000 * 60));
    
    if (minutes < 60) {
      return `${minutes} min`;
    } else {
      const hours = Math.floor(minutes / 60);
      const remainingMinutes = minutes % 60;
      return `${hours}h ${remainingMinutes}m`;
    }
  };
  
  // Handle replay meeting
  const handleReplayMeeting = (meetingId) => {
    const meeting = pastMeetings.find(m => m.id === meetingId);
    if (meeting) {
      setToastMessage(`Replaying recording of "${meeting.title}"`);
      setShowToast(true);
      
      // Hide toast after 3 seconds
      setTimeout(() => {
        setShowToast(false);
      }, 3000);
      
      // Navigate to recording playback (you can implement this route later)
      router.push(`/recordings/${meetingId}`);
    }
  };
  
  return (
    <motion.div 
      className="dashboard-container"
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <DashboardBackground />
      
      {/* Sidebar */}
      <motion.div 
        className="sidebar"
        initial={{ x: -50, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <motion.div 
          className="sidebar-logo"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          <img 
            src="/logo/lms.png" 
            alt="Logo" 
            className="logo-image"
          />
          {/* <motion.p 
            className="logo-text"
            // initial={{ y: 10, opacity: 0 }}
            // animate={{ y: 0, opacity: 1 }}
            // transition={{ duration: 0.5, delay: 0.4 }}
          >
            Uttar Pradesh's First Export Specific Incubation Center
          </motion.p> */}
        </motion.div>
        
        <motion.div 
          className={`sidebar-item ${activeSection === 'home' ? 'active' : ''}`}
          onClick={() => handleNavigation('home')}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaHome size={24} className="sidebar-icon" />
          <span>Home</span>
        </motion.div>
        
        <motion.div 
          className={`sidebar-item ${activeSection === 'upcoming' ? 'active' : ''}`}
          onClick={() => handleNavigation('upcoming')}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaCalendarAlt size={24} className="sidebar-icon" />
          <span>Upcoming</span>
        </motion.div>
        
        <motion.div 
          className={`sidebar-item ${activeSection === 'previous' ? 'active' : ''}`}
          onClick={() => handleNavigation('previous')}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaHistory size={24} className="sidebar-icon" />
          <span>Previous</span>
        </motion.div>
        
        <motion.div 
          className={`sidebar-item ${activeSection === 'recordings' ? 'active' : ''}`}
          onClick={() => handleNavigation('recordings')}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaVideo size={24} className="sidebar-icon" />
          <span>Recordings</span>
        </motion.div>
        
        <motion.div 
          className={`sidebar-item ${activeSection === 'meetings' ? 'active' : ''}`}
          onClick={() => handleNavigation('meetings')}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaUsers size={24} className="sidebar-icon" />
          <span>Meetings</span>
        </motion.div>

        {/* <motion.div 
          className={`sidebar-item ${activeSection === 'personal' ? 'active' : ''}`}
          onClick={() => openPersonalRoom()}
          whileHover={{ x: 5 }}
          whileTap={{ scale: 0.95 }}
        >
          <FaUserFriends size={24} className="sidebar-icon" />
          <span>Personal Room</span>
        </motion.div> */}
      </motion.div>
      
      {/* Main content */}
      <div className="main-content">
        {/* Header with time */}
        <motion.div 
          className="time-header"
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          <div className="time-display">
            <motion.h2
              className="institute-title"
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.25, duration: 0.5 }}
              style={{ 
                fontWeight: 'bold', 
                color: 'white', 
                fontSize: '3rem',
                marginBottom: '0.5rem',
                textAlign: 'center',
                paddingTop: '0px'
              }}
            >
              Institute of Entrepreneurship and Development, UP
            </motion.h2>
            <motion.h1
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.5 }}
            >
              {currentTime}
            </motion.h1>
            <motion.p
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.5 }}
            >
              {currentDate}
            </motion.p>
          </div>
        </motion.div>
        
        {/* Home Section - Action cards */}
        <AnimatePresence mode="wait">
          {activeSection === 'home' && (
            <motion.div 
              className="action-cards"
              key="home"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {/* New Meeting card */}
              <motion.div 
                className="action-card orange"
                onClick={handleNewMeeting}
                variants={itemVariants}
                whileHover="hover"
              >
                <div className="card-icon">
                  <FaVideo size={28} />
                </div>
                <div className="card-content">
                  <h3>New Meeting</h3>
                  <p>Start an instant meeting</p>
                </div>
              </motion.div>
              
              
              {/* Join Meeting card */}
              {/* <motion.div 
                className="action-card purple"
                onClick={handleJoinMeeting}
                variants={itemVariants}
                whileHover="hover"
              >
                <div className="card-icon">
                  <FaLink size={28} />
                </div>
                <div className="card-content">
                  <h3>Join Meeting</h3>
                  <p>via invitation link</p>
                </div>
              </motion.div> */}
              
              {/* Schedule Meeting card */}
              <motion.div 
                className="action-card violet"
                onClick={handleScheduleMeeting}
                variants={itemVariants}
                whileHover="hover"
              >
                <div className="card-icon">
                  <FaCalendarAlt size={28} />
                </div>
                <div className="card-content">
                  <h3>Schedule Meeting</h3>
                  <p>Plan your meeting</p>
                </div>
              </motion.div>
              
              {/* View Recordings card */}
              {/* <motion.div 
                className="action-card yellow"
                onClick={() => handleNavigation('recordings')}
                variants={itemVariants}
                whileHover="hover"
              >
                <div className="card-icon">
                  <FaPlay size={28} />
                </div>
                <div className="card-content">
                  <h3>View Recordings</h3>
                  <p>Meeting Recordings</p>
                </div>
              </motion.div> */}
            </motion.div>
          )
        }
          
          {/* Upcoming Meetings Section */}
          {activeSection === 'upcoming' && (
            <motion.div 
              className="section-content"
              key="upcoming"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <motion.h2 
                className="section-title"
                variants={itemVariants}
              >
                Upcoming Meetings
              </motion.h2>
              
              {scheduledMeetings.length === 0 ? (
                <motion.div 
                  className="empty-state"
                  variants={itemVariants}
                >
                  <DashboardIllustration type={DashboardIllustration.types.EMPTY_UPCOMING} size="lg" />
                  <p>No upcoming meetings</p>
                  <motion.button 
                    className="action-button"
                    onClick={handleScheduleMeeting}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Schedule a Meeting
                  </motion.button>
                </motion.div>
              ) : (
                <motion.div className="meeting-list">
                  {scheduledMeetings.map((meeting, index) => (
                    <motion.div 
                      key={meeting.id} 
                      className="meeting-item upcoming"
                      variants={itemVariants}
                      custom={index}
                      whileHover={{ scale: 1.02, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                    >
                      <div className="meeting-details" style={{ flex: 1, minWidth: 0 }}>
                        <div className="meeting-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '1rem' }}>
                          {editingMeetingId === meeting.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                              <input 
                                type="text" 
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                className="modal-input"
                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                              />
                              <button onClick={saveEditedTitle} className="join-button" style={{ padding: '0.35rem 0.6rem' }}>Save</button>
                              <button onClick={cancelEditTitle} className="secondary-button" style={{ padding: '0.35rem 0.6rem' }}>Cancel</button>
                            </div>
                          ) : (
                            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.title}</h4>
                          )}
                          <span className="meeting-time" style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {formatDate(meeting.date)}
                          </span>
                        </div>
                        <p className="meeting-description" style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0.5rem 0', lineHeight: 1.4 }}>{meeting.description || 'No description provided'}</p>
                        <div className="meeting-meta" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b', alignItems: 'center', marginTop: '0.75rem' }}>
                          <span className="meeting-duration" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(51, 65, 85, 0.5)', padding: '0.25rem 0.5rem', borderRadius: '0.5rem' }}>
                            <FaClock className="meta-icon" style={{ fontSize: '0.75rem', marginRight: '0.25rem' }} />
                            {meeting.duration || '1 hour'}
                          </span>
                        </div>
                      </div>
                      <div className="meeting-actions" style={{ marginLeft: '1rem', flexShrink: 0, display: 'flex', gap: '0.5rem' }}>
                        {editingMeetingId !== meeting.id && (
                          <motion.button 
                            className="secondary-button"
                            onClick={() => beginEditTitle(meeting)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                          >
                            <FaEdit size={14} />
                            Edit
                          </motion.button>
                        )}
                        <motion.button 
                          className="join-button"
                          onClick={() => router.push(`/rooms/${meeting.id}`)}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Join
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
              
              <motion.button 
                className="floating-action-button"
                onClick={handleScheduleMeeting}
                whileHover={{ scale: 1.1, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.5)" }}
                whileTap={{ scale: 0.9 }}
              >
                <FaPlus />
              </motion.button>
            </motion.div>
          )}
          
          {/* Previous Meetings Section */}
          {activeSection === 'previous' && (
            <motion.div 
              className="section-content"
              key="previous"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <motion.h2 
                className="section-title"
                variants={itemVariants}
              >
                Previous Meetings
              </motion.h2>
              
              {pastMeetings.length === 0 ? (
                <motion.div 
                  className="empty-state"
                  variants={itemVariants}
                >
                  <DashboardIllustration type={DashboardIllustration.types.EMPTY_PREVIOUS} size="lg" />
                  <p>No previous meetings</p>
                </motion.div>
              ) : (
                <motion.div className="meeting-list">
                  {pastMeetings.map((meeting, index) => (
                    <motion.div 
                      key={meeting.id} 
                      className="meeting-item"
                      variants={itemVariants}
                      custom={index}
                      whileHover={{ scale: 1.02, backgroundColor: 'rgba(100, 116, 139, 0.1)' }}
                    >
                      <div className="meeting-details">
                        <h3>{meeting.title}</h3>
                        <p>{formatDate(meeting.date)}</p>
                        <div className="meeting-meta">
                          <span>{calculateDuration(meeting.date)}</span>
                          <span>{meeting.participants || 0} participants</span>
                        </div>
                      </div>
                      <div className="meeting-actions">
                        <motion.button 
                          className="secondary-button"
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => handleReplayMeeting(meeting.id)}
                        >
                          <FaPlay className="mr-2" /> Replay
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </motion.div>
          )}
          
          {/* Recordings Section */}
          {activeSection === 'recordings' && (
            <motion.div 
              className="section-content"
              key="recordings"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <RecordingsList />
            </motion.div>
          )}

          {/* Meetings Section */}
          {activeSection === 'meetings' && (
            <motion.div 
              className="section-content"
              key="meetings"
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              <motion.h2 
                className="section-title"
                variants={itemVariants}
              >
                Meetings Overview
              </motion.h2>
              
              {/* Upcoming Meetings */}
              <motion.div 
                className="meetings-subsection"
                variants={itemVariants}
              >
                <div className="subsection-header">
                  <FaCalendar className="subsection-icon" />
                  <h3>Upcoming Meetings</h3>
                  <span className="meeting-count">
                    {scheduledMeetings.length} meetings
                  </span>
                </div>
                
                <div className="meeting-list">
                  {scheduledMeetings.length === 0 ? (
                    <div className="empty-state">
                      <p>No upcoming meetings scheduled</p>
                    </div>
                  ) : (
                    scheduledMeetings.map((meeting, index) => (
                      <motion.div 
                        key={meeting.id} 
                        className="meeting-item upcoming"
                        variants={itemVariants}
                        custom={index}
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                      >
                        <div className="meeting-details" style={{ flex: 1, minWidth: 0 }}>
                          <div className="meeting-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '1rem' }}>
                            {editingMeetingId === meeting.id ? (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flex: 1, minWidth: 0 }}>
                                <input 
                                  type="text" 
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  className="modal-input"
                                  style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', width: '100%' }}
                                />
                                <button onClick={saveEditedTitle} className="join-button" style={{ padding: '0.35rem 0.6rem' }}>Save</button>
                                <button onClick={cancelEditTitle} className="secondary-button" style={{ padding: '0.35rem 0.6rem' }}>Cancel</button>
                              </div>
                            ) : (
                              <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.title}</h4>
                            )}
                            <span className="meeting-time" style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatDate(meeting.date)}
                            </span>
                          </div>
                          <p className="meeting-description" style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0.5rem 0', lineHeight: 1.4 }}>{meeting.description || 'No description provided'}</p>
                          <div className="meeting-meta" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b', alignItems: 'center', marginTop: '0.75rem' }}>
                            <span className="meeting-duration" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(51, 65, 85, 0.5)', padding: '0.25rem 0.5rem', borderRadius: '0.5rem' }}>
                              <FaClock className="meta-icon" style={{ fontSize: '0.75rem', marginRight: '0.25rem' }} />
                              {meeting.duration || '1 hour'}
                            </span>
                          </div>
                        </div>
                        <div className="meeting-actions" style={{ marginLeft: '1rem', flexShrink: 0, display: 'flex', gap: '0.5rem' }}>
                          {editingMeetingId !== meeting.id && (
                            <motion.button 
                              className="secondary-button"
                              onClick={() => beginEditTitle(meeting)}
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              style={{ padding: '0.5rem 1rem', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                            >
                              <FaEdit size={14} />
                              Edit
                            </motion.button>
                          )}
                          <motion.button 
                            className="join-button"
                            onClick={() => router.push(`/rooms/${meeting.id}`)}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Join
                          </motion.button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
              
              {/* Past Meetings */}
              <motion.div 
                className="meetings-subsection"
                variants={itemVariants}
              >
                <div className="subsection-header">
                  <FaHistory className="subsection-icon" />
                  <h3>Past Meetings</h3>
                  <span className="meeting-count">
                    {pastMeetings.length} meetings
                  </span>
                </div>
                
                <div className="meeting-list">
                  {pastMeetings.length === 0 ? (
                    <div className="empty-state">
                      <p>No past meetings found</p>
                    </div>
                  ) : (
                    pastMeetings.map((meeting, index) => (
                      <motion.div 
                        key={meeting.id} 
                        className="meeting-item past"
                        variants={itemVariants}
                        custom={index}
                        whileHover={{ scale: 1.02, backgroundColor: 'rgba(100, 116, 139, 0.1)' }}
                      >
                        <div className="meeting-details" style={{ flex: 1, minWidth: 0 }}>
                          <div className="meeting-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem', gap: '1rem' }}>
                            <h4 style={{ margin: 0, fontSize: '1.125rem', fontWeight: 600, color: '#f8fafc', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{meeting.title}</h4>
                            <span className="meeting-time" style={{ fontSize: '0.875rem', color: '#60a5fa', fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
                              {formatDate(meeting.date)}
                            </span>
                          </div>
                          <p className="meeting-description" style={{ fontSize: '0.875rem', color: '#94a3b8', margin: '0.5rem 0', lineHeight: 1.4 }}>{meeting.description || 'No description provided'}</p>
                          <div className="meeting-meta" style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: '#64748b', alignItems: 'center', marginTop: '0.75rem' }}>
                            <span className="meeting-duration" style={{ display: 'flex', alignItems: 'center', backgroundColor: 'rgba(51, 65, 85, 0.5)', padding: '0.25rem 0.5rem', borderRadius: '0.5rem' }}>
                              <FaClock className="meta-icon" style={{ fontSize: '0.75rem', marginRight: '0.25rem' }} />
                              {meeting.duration || '1 hour'}
                            </span>
                          </div>
                        </div>
                        <div className="meeting-actions" style={{ marginLeft: '1rem', flexShrink: 0 }}>
                          <motion.button 
                            className="secondary-button"
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleReplayMeeting(meeting.id)}
                          >
                            <FaPlay className="mr-2" /> View Details
                          </motion.button>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </motion.div>
              
              <motion.button 
                className="floating-action-button"
                onClick={handleScheduleMeeting}
                whileHover={{ scale: 1.1, boxShadow: "0 10px 25px rgba(59, 130, 246, 0.5)" }}
                whileTap={{ scale: 0.9 }}
              >
                <FaPlus />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Modal overlays */}
      <AnimatePresence>
        {showModal && (
          <motion.div 
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div 
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", damping: 20 }}
              style={modalType === 'schedule' ? {
                maxWidth: '420px',
                padding: '1.5rem',
                maxHeight: '85vh',
                overflowY: 'auto'
              } : {}}
            >
              <motion.button 
                className="modal-close" 
                onClick={() => setShowModal(false)}
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
              >
                <FaTimes />
              </motion.button>
              
              {modalType === 'start' && (
                <>
                  <div className="modal-header">
                    <div className="modal-icon">
                      <FaVideo size={48} />
                    </div>
                    <h2>Start an Instant Meeting</h2>
                  </div>
                  <motion.button 
                    className="modal-button" 
                    onClick={startMeeting}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Start Meeting
                  </motion.button>
                </>
              )}
              
              {modalType === 'join' && (
                <>
                  <div className="modal-header">
                    <div className="modal-icon">
                      <FaLink size={48} />
                    </div>
                    <h2>Type the link here</h2>
                  </div>
                  <input 
                    type="text" 
                    placeholder="Meeting link" 
                    value={meetingLink}
                    onChange={(e) => setMeetingLink(e.target.value)}
                    className="modal-input"
                  />
                  <motion.button 
                    className="modal-button" 
                    onClick={joinMeeting}
                    disabled={!meetingLink}
                    whileHover={meetingLink ? { scale: 1.05 } : {}}
                    whileTap={meetingLink ? { scale: 0.95 } : {}}
                  >
                    Join Meeting
                  </motion.button>
                </>
              )}
              
              {modalType === 'schedule' && (
                <>
                  <div className="modal-header" style={{ marginBottom: '1rem' }}>
                    <div className="modal-icon" style={{ marginBottom: '0.5rem' }}>
                      <FaCalendarAlt size={32} />
                    </div>
                    <h2 style={{ fontSize: '1.25rem', margin: '0' }}>Create Meeting</h2>
                  </div>
                  <p className="input-label" style={{ fontSize: '0.875rem', margin: '0 0 0.25rem 0', fontWeight: '500' }}>Meeting Title</p>
                  <input 
                    type="text"
                    placeholder="Enter meeting title" 
                    value={meetingTitle}
                    onChange={(e) => setMeetingTitle(e.target.value)}
                    className="modal-input"
                    style={{ marginBottom: '0.75rem', padding: '0.5rem', fontSize: '0.875rem' }}
                  />
                  <p className="input-label" style={{ fontSize: '0.875rem', margin: '0 0 0.25rem 0', fontWeight: '500' }}>Description (Optional)</p>
                  <textarea 
                    placeholder="Add meeting description or agenda" 
                    value={meetingDescription}
                    onChange={(e) => setMeetingDescription(e.target.value)}
                    className="modal-textarea"
                    rows={2}
                    style={{ marginBottom: '0.75rem', padding: '0.5rem', fontSize: '0.875rem', resize: 'vertical', minHeight: '60px' }}
                  />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
                    <div>
                      <p className="input-label" style={{ fontSize: '0.875rem', margin: '0 0 0.25rem 0', fontWeight: '500' }}>Duration</p>
                      <select 
                        value={meetingDuration}
                        onChange={(e) => setMeetingDuration(e.target.value)}
                        className="modal-input"
                        style={{ padding: '0.5rem', fontSize: '0.875rem', width: '100%' }}
                      >
                        <option value="30 minutes">30 min</option>
                        <option value="1 hour">1 hour</option>
                        <option value="1.5 hours">1.5 hours</option>
                        <option value="2 hours">2 hours</option>
                        <option value="3 hours">3 hours</option>
                        <option value="All day">All day</option>
                      </select>
                    </div>
                    <div>
                      <p className="input-label" style={{ fontSize: '0.875rem', margin: '0 0 0.25rem 0', fontWeight: '500' }}>Date & Time</p>
                      <input 
                        type="datetime-local" 
                        value={meetingDateTime}
                        onChange={(e) => setMeetingDateTime(e.target.value)}
                        className="modal-input"
                        style={{ padding: '0.5rem', fontSize: '0.875rem', width: '100%' }}
                      />
                    </div>
                  </div>
                  <motion.button 
                    className="modal-button" 
                    onClick={scheduleMeeting}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{ padding: '0.75rem 1.5rem', fontSize: '0.875rem', marginTop: '0.5rem' }}
                  >
                    Schedule Meeting
                  </motion.button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Toast notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            className="toast-notification"
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            {toastMessage}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recording Status Indicator */}
      <AnimatePresence>
        {recordingStatus.isRecording && (
          <motion.div 
            className="recording-indicator"
            initial={{ x: 100, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 100, opacity: 0 }}
            transition={{ type: "spring", damping: 20 }}
          >
            <div className="recording-pulse"></div>
            <FaMicrophone className="recording-icon" />
            <span className="recording-text">
              Recording: {recordingStatus.recordingName || 'Untitled'}
            </span>
            <span className="recording-host">
              by {recordingStatus.hostName}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default EnhancedDashboard; 
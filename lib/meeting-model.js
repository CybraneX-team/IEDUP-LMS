// Meeting document structure for MongoDB
export const MeetingSchema = {
  title: String, // required
  description: String, // optional
  date: Date, // required - meeting date/time
  duration: String, // required - e.g., "1 hour", "30 minutes"
  roomName: String, // required - unique room identifier
  userId: String, // optional - for future user association
  createdAt: Date, // auto-generated
  updatedAt: Date, // auto-generated
};

// Validation function for meeting data
export function validateMeeting(meetingData) {
  const errors = [];

  if (!meetingData.title || meetingData.title.trim() === "") {
    errors.push("Title is required");
  }

  if (!meetingData.date) {
    errors.push("Date is required");
  } else {
    const meetingDate = new Date(meetingData.date);
    if (isNaN(meetingDate.getTime())) {
      errors.push("Invalid date format");
    } else if (meetingDate <= new Date()) {
      errors.push("Meeting date must be in the future");
    }
  }

  if (!meetingData.duration) {
    errors.push("Duration is required");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// Helper function to create a meeting document
export function createMeetingDocument(meetingData) {
  const now = new Date();

  return {
    title: meetingData.title.trim(),
    description: meetingData.description?.trim() || "",
    date: new Date(meetingData.date),
    duration: meetingData.duration,
    roomName:
      meetingData.roomName ||
      `meeting-${now.getTime()}-${Math.random().toString(36).substr(2, 9)}`,
    userId: meetingData.userId || null,
    createdAt: now,
    updatedAt: now,
  };
}

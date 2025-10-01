// Simple API functions for meeting operations

// Fetch all meetings
export async function fetchMeetings() {
  try {
    const response = await fetch("/api/meetings");
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return { success: false, error: "Failed to fetch meetings" };
  }
}

// Create a new meeting
export async function createMeeting(meetingData) {
  try {
    const response = await fetch("/api/meetings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meetingData),
    });

    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error creating meeting:", error);
    return { success: false, error: "Failed to create meeting" };
  }
}

import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { validateMeeting, createMeetingDocument } from "@/lib/meeting-model";

// GET /api/meetings - Fetch all meetings
export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("livekit_meeting");
    const meetings = await db
      .collection("meetings")
      .find({})
      .sort({ date: 1 })
      .toArray();

    // Convert MongoDB ObjectId to string and separate past/upcoming
    const now = new Date();
    const processedMeetings = meetings.map((meeting) => ({
      ...meeting,
      id: meeting._id.toString(),
      _id: undefined,
    }));

    const upcoming = processedMeetings.filter(
      (meeting) => new Date(meeting.date) > now
    );
    const past = processedMeetings.filter(
      (meeting) => new Date(meeting.date) <= now
    );

    return NextResponse.json({
      success: true,
      data: {
        upcoming: upcoming.sort((a, b) => new Date(a.date) - new Date(b.date)),
        past: past.sort((a, b) => new Date(b.date) - new Date(a.date)),
      },
    });
  } catch (error) {
    console.error("Error fetching meetings:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch meetings" },
      { status: 500 }
    );
  }
}

// POST /api/meetings - Create a new meeting
export async function POST(request) {
  try {
    const body = await request.json();

    // Validate meeting data
    const validation = validateMeeting(body);
    if (!validation.isValid) {
      return NextResponse.json(
        { success: false, error: validation.errors.join(", ") },
        { status: 400 }
      );
    }

    // Create meeting document
    const meetingDoc = createMeetingDocument(body);

    // Insert into MongoDB
    const client = await clientPromise;
    const db = client.db("livekit_meeting");
    const result = await db.collection("meetings").insertOne(meetingDoc);

    // Return created meeting
    const createdMeeting = {
      ...meetingDoc,
      id: result.insertedId.toString(),
    };

    return NextResponse.json(
      {
        success: true,
        data: createdMeeting,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create meeting" },
      { status: 500 }
    );
  }
}

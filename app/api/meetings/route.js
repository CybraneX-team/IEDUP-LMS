import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
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

// PATCH /api/meetings - Update meeting fields (e.g., title)
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, title, description, date, duration } = body || {};

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Meeting id is required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db("livekit_meeting");

    const update = { updatedAt: new Date() };
    if (typeof title === 'string') update.title = title.trim();
    if (typeof description === 'string') update.description = description.trim();
    if (typeof duration === 'string') update.duration = duration;
    if (typeof date === 'string' || date instanceof Date) {
      const d = new Date(date);
      if (isNaN(d.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid date format" },
          { status: 400 }
        );
      }
      update.date = d;
    }

    if (Object.keys(update).length === 1) {
      return NextResponse.json(
        { success: false, error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const result = await db
      .collection("meetings")
      .updateOne({ _id: new ObjectId(id) }, { $set: update });

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { success: false, error: "Meeting not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating meeting:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update meeting" },
      { status: 500 }
    );
  }
}

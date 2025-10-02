import { useRoomInfo, useLocalParticipant, useParticipantInfo, useRoomContext } from '../custom_livekit_react';
import { useState, useRef, useEffect, useCallback } from 'react';

// Simplified recording state interface
interface RecordingState {
  isRecording: boolean;
  isProcessing: boolean;
  isUploading: boolean;
  error: string | null;
  uploadId: string | null;
  recordingId: string | null;
  recordingName: string;
  totalParts: number;
  uploadedParts: number;
  totalSize: number;
  progress: number; // Progress percentage (0-100)
  progressMessage: string; // Current operation message
}

// Upload configuration
interface UploadConfig {
  chunkSize: number;
  maxRetries: number;
  retryDelay: number;
  quality: string;
  format: string;
  uploadId?: string;
}

function generateRecordingName(): string {
  const adjectives = ['Brave', 'Cosmic', 'Lucky', 'Mighty', 'Silent', 'Swift', 'Witty', 'Zen', 'Funky', 'Radiant'];
  const nouns = ['Tiger', 'Falcon', 'Nova', 'Pixel', 'Echo', 'Blaze', 'Comet', 'Vortex', 'Shadow', 'Spark'];
  return (
    adjectives[Math.floor(Math.random() * adjectives.length)] +
    nouns[Math.floor(Math.random() * nouns.length)] +
    Math.floor(Math.random() * 1000)
  );
}

// Client-side WebM to MP4 conversion using canvas and MediaRecorder
async function convertWebMToMP4(webmBlob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      console.log('[CONVERSION] Starting WebM to MP4 conversion...');
      
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      video.muted = true;
      video.playsInline = true;
      
      // Check if MP4 recording is supported
      let mp4MimeType = 'video/mp4';
      if (MediaRecorder.isTypeSupported('video/mp4;codecs=h264,aac')) {
        mp4MimeType = 'video/mp4;codecs=h264,aac';
      }
      
      const mp4Chunks: BlobPart[] = [];
      let mp4Recorder: MediaRecorder;
      
      video.onloadedmetadata = async () => {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        
        // Create a new stream combining canvas video with original audio
        const canvasStream = canvas.captureStream(30);
        
        // Extract audio tracks from the original video
        let audioTracks: MediaStreamTrack[] = [];
        
        try {
          // Try to get audio from the original video element
          if ('captureStream' in video && typeof (video as any).captureStream === 'function') {
            const videoStream = (video as any).captureStream();
            audioTracks = videoStream.getAudioTracks();
          }
        } catch (e) {
          console.warn('[CONVERSION] Could not extract audio tracks:', e);
        }
        
        // Combine canvas video with audio tracks
        const combinedStream = new MediaStream([
          ...canvasStream.getVideoTracks(),
          ...audioTracks
        ]);
        
        mp4Recorder = new MediaRecorder(combinedStream, { mimeType: mp4MimeType });
        
        mp4Recorder.ondataavailable = (event) => {
          if (event.data.size > 0) mp4Chunks.push(event.data);
        };
        
        mp4Recorder.onstop = () => {
          const mp4Blob = new Blob(mp4Chunks, { type: 'video/mp4' });
          resolve(mp4Blob);
        };
        
        mp4Recorder.start();
        video.play();
      };
      
      video.ontimeupdate = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      };
      
      video.onended = () => {
        if (mp4Recorder?.state !== 'inactive') mp4Recorder.stop();
      };
      
      video.src = URL.createObjectURL(webmBlob);
      
    } catch (error) {
      reject(error);
    }
  });
}

export function useRecordButton() {
  // Enhanced state management
  const [recordingState, setRecordingState] = useState<RecordingState>({
    isRecording: false,
    isProcessing: false,
    isUploading: false,
    error: null,
    uploadId: null,
    recordingId: null,
    recordingName: '',
    totalParts: 0,
    uploadedParts: 0,
    totalSize: 0,
    progress: 0,
    progressMessage: ''
  });

  // Refs for recording session
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadConfigRef = useRef<UploadConfig | null>(null);
  const presignedUrlsRef = useRef<string[]>([]);
  const uploadedPartsRef = useRef<Array<{ PartNumber: number; ETag: string }>>([]);
  const keyRef = useRef<string | null>(null);
  const currentRecordingIdRef = useRef<string | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const pendingUploadsRef = useRef<number>(0);
  const isRecordingStoppedRef = useRef<boolean>(false);
  const contentTypeRef = useRef<string>('video/mp4');

  // LiveKit context
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { identity: userId } = useParticipantInfo({ participant: localParticipant });
  const { name: roomName } = useRoomInfo();

  // Helper to show alerts
  const showAlert = useCallback((message: string, type: 'error' | 'success' | 'info' = 'info') => {
    alert(`${type.toUpperCase()}: ${message}`);
  }, []);

  // Helper to broadcast recording status to all participants
  const broadcastRecordingStatus = useCallback(async (action: 'start' | 'stop' | 'error') => {
    try {
      const data = {
        type: 'recording-status',
        action,
        hostIdentity: localParticipant?.identity || 'unknown',
        hostName: localParticipant?.name || 'Unknown Host',
        timestamp: Date.now(),
        recordingId: currentRecordingIdRef.current,
        recordingName: recordingState.recordingName
      };
      
      await room.localParticipant.publishData(
        new TextEncoder().encode(JSON.stringify(data)),
        { reliable: true }
      );
      
      console.log('[DEBUG] Broadcasted recording status:', action);
    } catch (error) {
      console.error('[DEBUG] Error broadcasting recording status:', error);
    }
  }, [room, localParticipant, recordingState.recordingName]);

  // Helper to initialize multipart upload
  const initializeMultipartUpload = useCallback(async (
    recordingId: string, 
    userId: string, 
    roomName: string, 
    timestamp: string, 
    recordingName: string,
    quality: string = 'medium',
    contentType: string = 'video/webm'
  ): Promise<boolean> => {
    try {
      setRecordingState(prev => ({ ...prev, isProcessing: true, error: null }));

      const response = await fetch('/api/recordings/multipart/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          roomName,
          timestamp,
          recordingId,
          recordingName,
          estimatedParts: 60,
          quality,
          contentType
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to initialize multipart upload');
      }

      const data = await response.json();
      
      // Store upload configuration
      uploadConfigRef.current = data.uploadConfig;
      console.log("abc", data.uploadConfig)
      presignedUrlsRef.current = data.presignedUrls;
      keyRef.current = data.key;
      uploadedPartsRef.current = [];

      // Update state
      setRecordingState(prev => ({
        ...prev,
        uploadId: data.uploadId,
        recordingId,
        recordingName,
        totalParts: data.maxParts,
        isProcessing: false
      }));

      // Store uploadId in uploadConfig for consistent access
      if (uploadConfigRef.current) {
        uploadConfigRef.current.uploadId = data.uploadId;
      }

      console.log('[DEBUG] Multipart upload initialized:', {
        uploadId: data.uploadId,
        presignedUrlsCount: data.presignedUrls.length,
        key: data.key,
        chunkSize: (data.uploadConfig.chunkSize / 1000) + 's',
        maxParts: data.maxParts
      });

      return true;
    } catch (error: any) {
      console.error('[DEBUG] Error initializing multipart upload:', error);
      setRecordingState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: error.message || 'Failed to initialize upload' 
      }));
      showAlert(error.message || 'Failed to initialize upload', 'error');
      return false;
    }
  }, [showAlert]);

  // Helper to upload chunk with retry logic
  const uploadChunkToS3 = useCallback(async (chunk: Blob, partNumber: number, contentType: string = 'video/mp4'): Promise<boolean> => {
    const maxRetries = uploadConfigRef.current?.maxRetries || 3;
    const retryDelay = uploadConfigRef.current?.retryDelay || 1000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!presignedUrlsRef.current[partNumber - 1]) {
          throw new Error(`No presigned URL for part number: ${partNumber}`);
        }

        console.log('[DEBUG] Uploading part', partNumber, 'attempt', attempt, 'size:', (chunk.size / (1024 * 1024)).toFixed(2), 'MB');

        const presignedUrl = presignedUrlsRef.current[partNumber - 1];
        const response = await fetch(presignedUrl, {
          method: 'PUT',
          body: chunk,
          headers: {
            'Content-Type': contentType
          }
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Upload failed for part ${partNumber}: ${response.status} - ${errorText}`);
        }

        const etag = response.headers.get('ETag');
        if (!etag) {
          throw new Error(`No ETag received for part ${partNumber}`);
        }

        // Remove quotes from ETag
        const cleanEtag = etag.replace(/"/g, '');
        
        uploadedPartsRef.current.push({
          PartNumber: partNumber,
          ETag: cleanEtag
        });

        // Update progress (without visual indicators)
        setRecordingState(prev => ({
          ...prev,
          uploadedParts: prev.uploadedParts + 1,
          totalSize: prev.totalSize + chunk.size
        }));

        console.log('[DEBUG] Successfully uploaded part:', { partNumber, etag: cleanEtag, size: (chunk.size / (1024 * 1024)).toFixed(2) + ' MB' });
        return true;

      } catch (error: any) {
        console.error(`[DEBUG] Error uploading chunk to S3 (attempt ${attempt}):`, error);
        
        if (attempt === maxRetries) {
          return false;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt));
      }
    }

    return false;
  }, []);

  // Helper to complete multipart upload
  const completeMultipartUpload = useCallback(async (): Promise<boolean> => {
    try {
      if (!uploadConfigRef.current?.uploadId || !keyRef.current || uploadedPartsRef.current.length === 0) {
        console.log('uploadConfigRef.current?.uploadId', uploadConfigRef.current?.uploadId);
        console.log('keyRef.current', keyRef.current);
        console.log('uploadedPartsRef.current', uploadedPartsRef.current);
        console.error('[DEBUG] Cannot complete upload - missing data');
        return false;
      }

      setRecordingState(prev => ({ ...prev, isUploading: true }));

      // Sort parts by part number to ensure ascending order
      const sortedParts = [...uploadedPartsRef.current].sort((a, b) => a.PartNumber - b.PartNumber);
      
      const requestBody = {
        uploadId: uploadConfigRef.current.uploadId,
        key: keyRef.current,
        parts: sortedParts,
        recordingMetadata: {
          recordingName: recordingState.recordingName,
          finalDuration: Math.round(recordingState.totalSize / (500 * 1024) * 30), // Estimate
          totalSize: recordingState.totalSize,
          quality: uploadConfigRef.current.quality
        }
      };

      console.log('[DEBUG] Sending completion request:', {
        uploadId: requestBody.uploadId,
        key: requestBody.key,
        partsCount: requestBody.parts.length,
        totalSize: (requestBody.recordingMetadata.totalSize / (1024 * 1024)).toFixed(2) + ' MB',
        recordingName: requestBody.recordingMetadata.recordingName
      });

      const response = await fetch('/api/recordings/multipart/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to complete multipart upload: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[DEBUG] Multipart upload completed:', data);

      setRecordingState(prev => ({ 
        ...prev, 
        isUploading: false,
        error: null
      }));

      // showAlert('Recording saved successfully!', 'success');
      return true;
    } catch (error: any) {
      console.error('[DEBUG] Error completing multipart upload:', error);
      setRecordingState(prev => ({ 
        ...prev, 
        isUploading: false, 
        error: error.message || 'Failed to complete upload' 
      }));
      showAlert(error.message || 'Failed to complete upload', 'error');
      return false;
    }
  }, [recordingState.recordingName, recordingState.totalSize, showAlert]);

  // Process and upload recording after getting name
  const processAndUploadRecording = useCallback(async (chunks: Blob[], recordingName: string) => {
    try {
      console.log(`[DEBUG] Processing recording: ${recordingName}`);
      setRecordingState(prev => ({ 
        ...prev, 
        isProcessing: true, 
        progress: 5, 
        progressMessage: 'Initializing upload...' 
      }));



      // Combine all chunks into one blob
      console.log(`[DEBUG] Combining ${chunks.length} chunks...`);
      const combinedBlob = new Blob(chunks, { type: contentTypeRef.current });
      
      let finalBlob = combinedBlob;
      let finalContentType = contentTypeRef.current;
      let finalExtension = contentTypeRef.current === 'video/mp4' ? '.mp4' : '.webm';
      
      // Convert WebM to MP4 if needed
      if (contentTypeRef.current === 'video/webm') {
        console.log('[DEBUG] Converting complete recording to MP4...');
        setRecordingState(prev => ({ 
          ...prev, 
          progress: 10, 
          progressMessage: 'Converting to MP4...' 
        }));
        
        try {
          finalBlob = await convertWebMToMP4(combinedBlob);
          finalContentType = 'video/mp4';
          finalExtension = '.mp4';
          console.log('[DEBUG] Successfully converted to MP4');
          setRecordingState(prev => ({ 
            ...prev, 
            progress: 20, 
            progressMessage: 'Conversion completed' 
          }));
        } catch (error) {
          console.error('[DEBUG] Conversion failed, will upload as WebM:', error);
          setRecordingState(prev => ({ 
            ...prev, 
            progress: 20, 
            progressMessage: 'Conversion failed, uploading as WebM' 
          }));
          // Keep original WebM if conversion fails
        }
      } else {
        setRecordingState(prev => ({ 
          ...prev, 
          progress: 20, 
          progressMessage: 'Preparing for upload...' 
        }));
      }
      
      // Initialize multipart upload with the final content type (after conversion)
      console.log(`[DEBUG] Initializing upload for ${finalContentType} file...`);
      setRecordingState(prev => ({ 
        ...prev, 
        progress: 25, 
        progressMessage: 'Initializing upload...' 
      }));
      
      const recordingId = currentRecordingIdRef.current || crypto.randomUUID();
      const timestamp = Date.now().toString();
      
      const uploadInitialized = await initializeMultipartUpload(
        recordingId,
        userId || 'unknownUser',
        roomName || 'unknownRoom',
        timestamp,
        recordingName,
        'medium', // Default quality
        finalContentType // Use final content type after conversion
      );
      
      if (!uploadInitialized) {
        console.error('[DEBUG] Failed to initialize upload');
        setRecordingState(prev => ({ 
          ...prev, 
          error: 'Failed to initialize upload',
          isRecording: false,
          isProcessing: false
        }));
        showAlert('Failed to initialize upload', 'error');
        return;
      }
      
      // Upload file in chunks with progress tracking
      console.log(`[DEBUG] Starting chunked upload of ${finalContentType} file...`);
      setRecordingState(prev => ({ 
        ...prev, 
        isUploading: true, 
        progress: 30, 
        progressMessage: 'Starting upload...' 
      }));
      
      const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks
      const totalChunks = Math.ceil(finalBlob.size / CHUNK_SIZE);
      let uploadedBytes = 0;
      
      console.log(`[DEBUG] File size: ${(finalBlob.size / (1024 * 1024)).toFixed(2)} MB, splitting into ${totalChunks} chunks`);
      
      // Upload chunks with progress tracking
      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const start = chunkIndex * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, finalBlob.size);
        const chunk = finalBlob.slice(start, end);
        const partNumber = chunkIndex + 1;
        
        console.log(`[DEBUG] Uploading chunk ${partNumber}/${totalChunks} (${(chunk.size / (1024 * 1024)).toFixed(2)} MB)`);
        
        setRecordingState(prev => ({
          ...prev,
          progress: Math.round((chunkIndex / totalChunks) * 100),
          progressMessage: `Uploading chunk ${partNumber} of ${totalChunks}...`
        }));
        
        pendingUploadsRef.current++;
        const uploadSuccess = await uploadChunkToS3(chunk, partNumber, finalContentType);
        pendingUploadsRef.current--;
        
        if (!uploadSuccess) {
          console.error(`[DEBUG] Failed to upload chunk ${partNumber}`);
          setRecordingState(prev => ({ 
            ...prev, 
            error: `Upload failed at chunk ${partNumber}`,
            isRecording: false,
            isProcessing: false,
            isUploading: false,
            progress: 0,
            progressMessage: ''
          }));
          showAlert(`Upload failed at chunk ${partNumber}`, 'error');
          await abortMultipartUpload();
          return;
        }
        
        uploadedBytes += chunk.size;
        const progress = Math.round((uploadedBytes / finalBlob.size) * 100);
        setRecordingState(prev => ({
          ...prev,
          progress: progress,
          progressMessage: `Uploaded ${(uploadedBytes / (1024 * 1024)).toFixed(1)} MB of ${(finalBlob.size / (1024 * 1024)).toFixed(1)} MB`
        }));
      }
      
      console.log(`[DEBUG] All ${totalChunks} chunks uploaded successfully`);
      setRecordingState(prev => ({
        ...prev,
        progress: 100,
        progressMessage: 'Finalizing upload...'
      }));
      
      // Complete the upload
      const completionSuccess = await completeMultipartUpload();
      if (!completionSuccess) {
        console.error('[DEBUG] Failed to complete multipart upload');
        setRecordingState(prev => ({ 
          ...prev, 
          error: 'Failed to finalize upload',
          isProcessing: false,
          isUploading: false,
          progress: 0,
          progressMessage: ''
        }));
        await abortMultipartUpload();
      } else {
        console.log('[DEBUG] Recording uploaded successfully');
        setRecordingState(prev => ({ 
          ...prev, 
          isProcessing: false,
          isUploading: false,
          progress: 0,
          progressMessage: 'Upload completed successfully!'
        }));
        showAlert('Recording uploaded successfully!', 'success');
        
        // Clear progress message after a delay
        setTimeout(() => {
          setRecordingState(prev => ({ ...prev, progressMessage: '' }));
        }, 3000);
      }
      
    } catch (error) {
      console.error('[DEBUG] Error processing recording:', error);
      setRecordingState(prev => ({ 
        ...prev, 
        error: 'Processing failed',
        isRecording: false,
        isProcessing: false
      }));
      showAlert('Recording processing failed', 'error');
    } finally {
      // Clean up
      recordingChunksRef.current = [];
    }
  }, [userId, roomName, initializeMultipartUpload, uploadChunkToS3, completeMultipartUpload, showAlert]);

  // Helper to abort multipart upload
  const abortMultipartUpload = useCallback(async (): Promise<void> => {
    try {
      if (!uploadConfigRef.current?.uploadId || !keyRef.current) {
        return;
      }

      await fetch('/api/recordings/multipart/abort', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uploadId: uploadConfigRef.current.uploadId,
          key: keyRef.current
        })
      });

      console.log('[DEBUG] Multipart upload aborted');
    } catch (error) {
      console.error('[DEBUG] Error aborting multipart upload:', error);
    }
  }, []);

  // Handle beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (recordingState.isRecording && currentRecordingIdRef.current) {
        console.log('[DEBUG] beforeunload - recording in progress');
        // Note: Cannot complete upload on beforeunload due to browser limitations
        // The upload will be handled by the backend cleanup process
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [recordingState.isRecording]);

  // Start recording
  const startRecording = useCallback(async () => {
    let screenStream: MediaStream | null = null;
    let micStream: MediaStream | null = null;
    
    try {
      setRecordingState(prev => ({ 
        ...prev, 
        error: null, 
        uploadedParts: 0,
        totalSize: 0
      }));

      // Reset upload tracking
      pendingUploadsRef.current = 0;
      isRecordingStoppedRef.current = false;
      recordingChunksRef.current = []; // Clear any previous chunks

      // Get screen capture (video only - no system audio)
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { 
          displaySurface: 'monitor',
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false // Disable system audio - only use microphone
      });

      // Get microphone audio stream
      micStream = await navigator.mediaDevices.getUserMedia({
        video :{
          
        },
        audio: {
          sampleRate: 44100,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }

      });

      // Combine screen video with microphone audio
      const stream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...micStream.getAudioTracks()
      ]);
      
      streamRef.current = stream;

      let mimeType = 'video/mp4;codecs=h264,aac';
      let contentType = 'video/mp4';

      // Fallback to WebM if MP4 is not supported
      if (!window.MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm;codecs=vp9';
        contentType = 'video/webm';
        console.warn('[DEBUG] MP4 recording not supported, falling back to WebM');
      }
      
      // Store content type in ref for use in event handlers
      contentTypeRef.current = contentType;
      
      console.log(`[DEBUG] Recording will use format: ${contentType} with mimeType: ${mimeType}`);
      
      // Enhanced recording options for better quality
      const mediaRecorder = new window.MediaRecorder(stream, { 
        mimeType,
        videoBitsPerSecond: 2500000,  // 2.5 Mbps for 720p quality
        audioBitsPerSecond: 128000    // 128 kbps for better audio
      });
      
      mediaRecorderRef.current = mediaRecorder;

      // Generate recording metadata (don't initialize upload yet)
      const recordingId = crypto.randomUUID();
      const recordingName = generateRecordingName();

      // Store recording ID in ref for consistent access
      currentRecordingIdRef.current = recordingId;

      // Set up data handlers
      mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          // Simply collect chunks during recording
          recordingChunksRef.current.push(event.data);
          console.log(`[DEBUG] Collected chunk: ${(event.data.size / (1024 * 1024)).toFixed(2)} MB`);
        }
      };

      mediaRecorder.onstop = async () => {
        console.log('[DEBUG] MediaRecorder stopped');
        
        try {
          if (recordingChunksRef.current.length === 0) {
            console.log('[DEBUG] No chunks recorded');
            setRecordingState(prev => ({ ...prev, isRecording: false, error: 'No data recorded' }));
            return;
          }
          
          // Prompt for recording name
          let name = window.prompt('Name your recording:', recordingState.recordingName || generateRecordingName());
          if (!name || !name.trim()) {
            name = generateRecordingName();
          }
          
          // Update state with the new name
          setRecordingState(prev => ({ ...prev, recordingName: name.trim() }));
          
          // Process and upload with the user-provided name
          await processAndUploadRecording([...recordingChunksRef.current], name.trim());
          
        } catch (error) {
          console.error('[DEBUG] Error in onstop handler:', error);
          setRecordingState(prev => ({ 
            ...prev, 
            error: 'Processing failed',
            isRecording: false 
          }));
          showAlert('Recording processing failed', 'error');
          // Clean up on error
          recordingChunksRef.current = [];
        }
        
        // Clean up streams
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        
        // Also clean up individual streams if they exist
        if (screenStream) {
          screenStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
        if (micStream) {
          micStream.getTracks().forEach((track: MediaStreamTrack) => track.stop());
        }
      };

      // Start recording
      mediaRecorder.start(180000); // 3min chunks to meet S3 5MB minimum
      
      setRecordingState(prev => ({ 
        ...prev, 
        isRecording: true, 
        isProcessing: false,
        recordingId,
        recordingName
      }));
      
      // Broadcast recording start
      await broadcastRecordingStatus('start');

    } catch (err: any) {
      console.error('Error starting recording:', err);
      setRecordingState(prev => ({ 
        ...prev, 
        isProcessing: false, 
        error: err.message || 'Failed to start recording' 
      }));
      showAlert(err.message || 'Failed to start recording', 'error');
    }
  }, [userId, roomName, initializeMultipartUpload, uploadChunkToS3, completeMultipartUpload, abortMultipartUpload, broadcastRecordingStatus, showAlert]);

  // Stop recording
  const stopRecording = useCallback(async () => {
    console.log('[DEBUG] stopRecording called');
    
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setRecordingState(prev => ({ ...prev, isRecording: false }));
      
      // Broadcast recording stop
      await broadcastRecordingStatus('stop');
    }
  }, [broadcastRecordingStatus]);

  // Toggle recording
  const toggleRecording = useCallback(async () => {
    if (recordingState.isProcessing) return;
    
    try {
      if (recordingState.isRecording) {
        await stopRecording();
      } else {
        await startRecording();
      }
    } catch (err: any) {
      console.error('Error toggling recording:', err);
      setRecordingState(prev => ({ 
        ...prev, 
        error: err.message || 'Failed to toggle recording' 
      }));
      showAlert(err.message || 'Failed to toggle recording', 'error');
    }
  }, [recordingState.isRecording, recordingState.isProcessing, startRecording, stopRecording, showAlert]);

  // Button props - optimized for navbar
  const buttonProps = {
    onClick: toggleRecording,
    disabled: recordingState.isProcessing || recordingState.isUploading,
    className: 'lk-button',
    style: {
      background: recordingState.isRecording ? 'var(--lk-danger)' : undefined,
      color: recordingState.isRecording ? 'var(--lk-text)' : undefined,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      padding: '8px 16px',
      border: 'none',
      cursor: recordingState.isProcessing || recordingState.isUploading ? 'not-allowed' : 'pointer',
      opacity: recordingState.isProcessing || recordingState.isUploading ? 0.6 : 1,
      transition: 'all 0.2s ease',
      fontSize: '14px',
      fontWeight: '500'
    }
  };

  return { 
    buttonProps, 
    recordingState
  };
}

export function RecordButton() {
  const { buttonProps, recordingState } = useRecordButton();

  return (
    <>
      <button {...buttonProps}>
        <span style={{ 
          fontSize: '1.2em', 
          color: recordingState.isRecording ? '#ff1744' : 'inherit',
          filter: recordingState.isProcessing || recordingState.isUploading ? 'grayscale(50%)' : 'none'
        }}>
          {recordingState.isRecording ? '⏹️' : '⏺️'}
        </span>
        {recordingState.isRecording ? 'Stop Recording' : 'Start Recording'}
      </button>

      {/* Full Screen Progress Overlay */}
      {(recordingState.isProcessing || recordingState.isUploading) && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: 'white'
        }}>
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            borderRadius: '12px',
            padding: '40px',
            minWidth: '400px',
            maxWidth: '500px',
            textAlign: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
            color: '#333'
          }}>
            {/* Processing/Upload Icon */}
            <div style={{
              fontSize: '3em',
              marginBottom: '20px',
              animation: 'spin 2s linear infinite'
            }}>
              {recordingState.isUploading ? '📤' : '⚙️'}
            </div>

            {/* Title */}
            <h3 style={{
              margin: '0 0 20px 0',
              fontSize: '1.4em',
              fontWeight: '600',
              color: '#333'
            }}>
              {recordingState.isUploading ? 'Uploading Recording' : 'Processing Recording'}
            </h3>

            {/* Progress Bar */}
            <div style={{
              width: '100%',
              height: '8px',
              backgroundColor: '#e0e0e0',
              borderRadius: '4px',
              overflow: 'hidden',
              marginBottom: '15px'
            }}>
              <div style={{
                width: `${recordingState.progress}%`,
                height: '100%',
                backgroundColor: recordingState.isUploading ? '#4caf50' : '#2196f3',
                transition: 'width 0.3s ease',
                borderRadius: '4px'
              }} />
            </div>

            {/* Progress Text */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px',
              fontSize: '0.95em'
            }}>
              <span style={{ color: '#666' }}>{recordingState.progressMessage}</span>
              <span style={{ 
                color: '#333', 
                fontWeight: '600',
                fontSize: '1.1em'
              }}>
                {recordingState.progress}%
              </span>
            </div>

            {/* Additional Info */}
            <div style={{
              fontSize: '0.85em',
              color: '#888',
              marginTop: '15px'
            }}>
              {recordingState.isUploading 
                ? 'Please keep this page open until upload completes'
                : 'Converting your recording to MP4 format'
              }
            </div>
          </div>
        </div>
      )}

      {/* Success Toast */}
      {recordingState.progressMessage && !recordingState.isProcessing && !recordingState.isUploading && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          backgroundColor: '#4caf50',
          color: 'white',
          padding: '15px 20px',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 9999,
          fontSize: '0.9em',
          fontWeight: '500'
        }}>
          ✅ {recordingState.progressMessage}
        </div>
      )}

      {/* CSS Animation */}
      <style jsx>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
} 
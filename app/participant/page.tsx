'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
// Import the participant page component from the JSX file (relative path)
import ParticipantPage from '../participantspage/page.jsx';

export default function ParticipantLanding() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    try {
      const token = localStorage.getItem('participantToken');
      const data = localStorage.getItem('participantData');
      if (token || data) {
        setAuthorized(true);
      } else {
        router.replace('/participant-login');
      }
    } catch (e) {
      router.replace('/participant-login');
    }
  }, [router]);

  if (!authorized) return null;

  return <ParticipantPage />;
}

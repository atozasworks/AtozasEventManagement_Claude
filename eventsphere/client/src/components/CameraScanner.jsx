import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

/**
 * Reads QR codes from the device camera (rear camera on phones) and calls onScan(text).
 * Frames are decoded in the browser, so it works without internet once the page is open.
 * Browsers only allow camera access on https:// addresses (and on localhost).
 */
const SCAN_EVERY_MS = 150; // about 6 reads a second - plenty, and easy on phone batteries
const SAME_CODE_PAUSE_MS = 3000; // a ticket held in front of the camera is read once, not 20 times

function explain(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
    return 'Camera access is blocked. Allow the camera for this site in your browser settings, then press "Scan with camera" again.';
  }
  if (err?.name === 'NotFoundError' || err?.name === 'OverconstrainedError') return 'No camera was found on this device. Type the code or use a handheld scanner instead.';
  if (err?.name === 'NotReadableError') return 'The camera is being used by another app. Close it and try again.';
  return `The camera could not be started${err?.message ? ` (${err.message})` : ''}.`;
}

export default function CameraScanner({ onScan }) {
  const videoRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan; // always call the latest handler without restarting the camera
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream;
    let frame;
    let stopped = false;
    let lastCode = '';
    let lastAt = 0;
    let lastRead = 0;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function tick(now) {
      if (stopped) return;
      frame = requestAnimationFrame(tick);
      const video = videoRef.current;
      if (now - lastRead < SCAN_EVERY_MS || !video || video.readyState < 2 || !video.videoWidth) return;
      lastRead = now;
      // Shrink large camera frames - QR codes decode fine at ~720px and it is much faster
      const scale = Math.min(1, 720 / video.videoWidth);
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      const code = found?.data?.trim();
      if (code && (code !== lastCode || now - lastAt > SAME_CODE_PAUSE_MS)) {
        lastCode = code;
        lastAt = now;
        onScanRef.current(code);
      }
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('The camera only works on a secure address (https://) or on localhost. Type the code or use a handheld scanner instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play();
        setReady(true);
        frame = requestAnimationFrame(tick);
      } catch (err) {
        if (!stopped) setError(explain(err));
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  if (error) return <div className="alert error">{error}</div>;
  return (
    <div className="camera">
      <video ref={videoRef} playsInline muted />
      <div className="camera-frame" aria-hidden="true" />
      <span className="camera-hint">{ready ? 'Hold the QR code inside the square' : 'Starting camera…'}</span>
    </div>
  );
}

'use client';

import React, { useEffect, useRef, useState } from 'react';

interface FadingVideoProps {
  src: string | string[];
  className?: string;
  style?: React.CSSProperties;
}

export default function FadingVideo({ src, className, style }: FadingVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentSrcIndex, setCurrentSrcIndex] = useState(0);
  const activeSrc = Array.isArray(src) ? src[currentSrcIndex] : src;

  const opacityRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const isFadingOutRef = useRef(false);

  const setOpacity = (val: number) => {
    opacityRef.current = Math.max(0, Math.min(1, val));
    if (videoRef.current) {
      videoRef.current.style.opacity = String(opacityRef.current);
    }
  };

  const animateFade = (targetOpacity: number, duration: number, callback?: () => void) => {
    const startOpacity = opacityRef.current;
    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      const current = startOpacity + (targetOpacity - startOpacity) * progress;
      setOpacity(current);

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        if (callback) callback();
      }
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    animationFrameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    setOpacity(0);
    isFadingOutRef.current = false;
  }, [activeSrc]);

  const handleLoadedData = () => {
    isFadingOutRef.current = false;
    animateFade(1, 500);
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || isFadingOutRef.current) return;

    const remainingTime = video.duration - video.currentTime;
    if (remainingTime <= 0.55 && opacityRef.current > 0 && !video.paused) {
      isFadingOutRef.current = true;
      animateFade(0, 550);
    }
  };

  const handleEnded = () => {
    if (Array.isArray(src)) {
      setCurrentSrcIndex((prev) => (prev + 1) % src.length);
    } else {
      const video = videoRef.current;
      if (video) {
        video.currentTime = 0;
        video.play().catch(console.error);
        isFadingOutRef.current = false;
        animateFade(1, 500);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <video
      ref={videoRef}
      src={activeSrc}
      className={className}
      style={{
        ...style,
        opacity: 0,
        transition: 'none',
      }}
      autoPlay
      muted
      playsInline
      preload="auto"
      onLoadedData={handleLoadedData}
      onTimeUpdate={handleTimeUpdate}
      onEnded={handleEnded}
    />
  );
}

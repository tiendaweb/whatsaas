"use client";

import React, { useEffect, useRef, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Play, Pause } from "lucide-react";

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds === 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

interface CustomAudioPlayerProps {
  src: string;
  isMe: boolean;
}

export function CustomAudioPlayer({ src, isMe }: CustomAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (!audio) return;

      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };
  }, []);

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const togglePlayPause = async () => {
    if (!isLoaded) {
      setIsLoaded(true);
      return;
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        try {
          await audioRef.current.play();
          setIsPlaying(true);
        } catch (error) {
          setIsPlaying(false);
          console.error('Audio playback error:', error);
        }
      }
    }
  };

  useEffect(() => {
    if (!isLoaded || !audioRef.current) return;

    audioRef.current.playbackRate = playbackSpeed;
    audioRef.current
      .play()
      .then(() => setIsPlaying(true))
      .catch((error) => {
        setIsPlaying(false);
        console.error('Audio playback error:', error);
      });
  }, [isLoaded, playbackSpeed]);

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (audioRef.current) {
      const newTime = Number(e.target.value);
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
    }
  };

  const togglePlaybackSpeed = () => {
    const speeds = [1, 1.5, 2];
    const currentSpeedIndex = speeds.indexOf(playbackSpeed);
    const nextSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    const newSpeed = speeds[nextSpeedIndex];
    setPlaybackSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };
  
  const playerColorClass = isMe ? 'accent-green-600' : 'accent-blue-600';

  return (
    <div className="my-1 flex w-full max-w-full min-w-0 items-center gap-2 sm:max-w-xs">
      {isLoaded && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          className="hidden"
        />
      )}
      <Button 
        variant="ghost" 
        size="icon" 
        className="h-8 w-8 shrink-0 rounded-full"
        onClick={togglePlayPause}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
      <span className="text-xs text-gray-600 min-w-[36px]">{formatTime(currentTime)}</span>
      <input
        type="range"
        min="0"
        max={duration || 0}
        value={currentTime}
        onChange={handleScrubberChange}
        className={`h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg bg-gray-200 ${playerColorClass}`}
      />
      <span className="text-xs text-gray-600 min-w-[36px]">{formatTime(duration)}</span>
      <Button 
        variant="ghost" 
        size="sm" 
        className="h-8 shrink-0 rounded-full px-2 text-xs font-semibold"
        onClick={togglePlaybackSpeed}
      >
        {playbackSpeed}x
      </Button>
    </div>
  );
}

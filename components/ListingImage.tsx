"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";

const PLACEHOLDER = "/listing-placeholder.svg";

type ListingImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  src?: string | null;
  fallbackSrc?: string;
  onFallbackChange?: (usingFallback: boolean) => void;
};

export default function ListingImage({
  src,
  fallbackSrc = PLACEHOLDER,
  onFallbackChange,
  alt,
  onError,
  ...props
}: ListingImageProps) {
  const initialSource = src || fallbackSrc;
  const [currentSource, setCurrentSource] = useState(initialSource);

  useEffect(() => {
    setCurrentSource(initialSource);
    onFallbackChange?.(!src);
  }, [initialSource, onFallbackChange, src]);

  return (
    <img
      {...props}
      src={currentSource}
      alt={alt}
      onError={(event) => {
        onError?.(event);
        if (
          currentSource.includes("recycleinme.com/storage/userimg/") &&
          currentSource.endsWith(".webp")
        ) {
          setCurrentSource(`${currentSource.slice(0, -5)}.jpg`);
        } else if (currentSource !== fallbackSrc) {
          setCurrentSource(fallbackSrc);
          onFallbackChange?.(true);
        } else if (currentSource !== PLACEHOLDER) {
          setCurrentSource(PLACEHOLDER);
          onFallbackChange?.(true);
        }
      }}
    />
  );
}

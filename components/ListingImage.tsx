"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";

const PLACEHOLDER = "/listing-placeholder.svg";

type ListingImageProps = Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  "src"
> & {
  src?: string | null;
};

export default function ListingImage({
  src,
  alt,
  onError,
  ...props
}: ListingImageProps) {
  const initialSource = src || PLACEHOLDER;
  const [currentSource, setCurrentSource] = useState(initialSource);

  useEffect(() => {
    setCurrentSource(initialSource);
  }, [initialSource]);

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
        } else if (currentSource !== PLACEHOLDER) {
          setCurrentSource(PLACEHOLDER);
        }
      }}
    />
  );
}

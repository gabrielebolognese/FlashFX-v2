import React, { useEffect, useRef, useState } from 'react';
import { ImageFilters } from '../../types/design';
import { getFilterProcessor } from '../../utils/webglFilters';

interface ImageWithFiltersProps {
  src: string;
  alt: string;
  filters?: ImageFilters;
  style?: React.CSSProperties;
  className?: string;
}

const ImageWithFilters: React.FC<ImageWithFiltersProps> = ({
  src,
  alt,
  filters,
  style,
  className
}) => {
  const [filteredSrc, setFilteredSrc] = useState<string>(src);
  const [isProcessing, setIsProcessing] = useState(false);
  const processingRef = useRef<boolean>(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const hasActiveFilters = (f?: ImageFilters): boolean => {
    if (!f) return false;

    return (
      f.brightness !== 0 ||
      f.contrast !== 0 ||
      f.exposure !== 0 ||
      f.gamma !== 1.0 ||
      f.saturation !== 0 ||
      f.vibrance !== 0 ||
      f.temperature !== 0 ||
      f.tint !== 0 ||
      f.hue !== 0 ||
      f.lightness !== 0 ||
      f.grayscale !== 0 ||
      f.sepia !== 0 ||
      f.invert ||
      f.gaussianBlur > 0 ||
      f.boxBlur > 0 ||
      f.surfaceBlur > 0 ||
      f.sharpen > 0 ||
      f.clarity !== 0 ||
      f.chromaKeyEnabled === true
    );
  };

  useEffect(() => {
    const applyFilters = async () => {
      if (processingRef.current) return;

      if (!filters || !hasActiveFilters(filters)) {
        setFilteredSrc(src);
        return;
      }

      processingRef.current = true;
      setIsProcessing(true);

      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise((resolve, reject) => {
          img.onload = resolve;
          img.onerror = reject;
          img.src = src;
        });

        const processor = getFilterProcessor();
        const result = await processor.applyFilters(
          src,
          filters,
          img.width,
          img.height
        );

        setFilteredSrc(result);
      } catch (error) {
        console.error('Failed to apply filters:', error);
        setFilteredSrc(src);
      } finally {
        setIsProcessing(false);
        processingRef.current = false;
      }
    };

    applyFilters();
  }, [src, filters]);

  return (
    <img
      ref={imgRef}
      src={filteredSrc}
      alt={alt}
      style={{
        ...style,
        opacity: isProcessing ? 0.7 : 1,
        transition: 'opacity 0.2s ease'
      }}
      className={className}
      draggable={false}
    />
  );
};

export default ImageWithFilters;

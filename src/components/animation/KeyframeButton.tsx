import React from 'react';
import { Diamond } from 'lucide-react';

interface KeyframeButtonProps {
  onClick: () => void;
  isActive: boolean;
  title?: string;
  size?: 'sm' | 'md';
}

const KeyframeButton: React.FC<KeyframeButtonProps> = ({
  onClick,
  isActive,
  title = 'Add keyframe',
  size = 'sm'
}) => {
  const sizeClass = size === 'sm' ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5';

  return (
    <button
      onClick={onClick}
      className={`p-0.5 hover:bg-gray-600/50 rounded transition-all duration-200 ${
        isActive ? 'bg-yellow-500/20' : ''
      }`}
      title={title}
    >
      <Diamond
        className={`${sizeClass} transition-colors duration-200 ${
          isActive
            ? 'text-yellow-400 fill-yellow-400'
            : 'text-gray-500 hover:text-cyan-400'
        }`}
      />
    </button>
  );
};

export default KeyframeButton;

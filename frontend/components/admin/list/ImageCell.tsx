interface ImageCellProps {
  src: string | null | undefined;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ImageCell({ src, alt = '', size = 'sm' }: ImageCellProps) {
  const sizeClasses = {
    sm: 'h-10 w-10',
    md: 'h-16 w-16',
    lg: 'h-32 w-32',
  };

  return (
    <div className={`${sizeClasses[size]} rounded bg-gray-100 overflow-hidden flex items-center justify-center`}>
      {src ? (
        <img src={src} alt={alt} className={`${sizeClasses[size]} object-cover`} />
      ) : (
        <div className={`${sizeClasses[size]} bg-gray-200 flex items-center justify-center`}>
          <span className="text-xs text-gray-400">No image</span>
        </div>
      )}
    </div>
  );
}
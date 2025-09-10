import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

const FileUpload = ({ label, onUpload, disabled }) => {
  const onDrop = useCallback((acceptedFiles) => {
    if (acceptedFiles.length > 0 && !disabled) {
      onUpload(acceptedFiles[0]);
    }
  }, [onUpload, disabled]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/tiff': ['.tif', '.tiff'],
    },
    multiple: false,
    disabled: disabled
  });

  return (
    <div 
      {...getRootProps()} 
      className={`file-upload ${disabled ? 'disabled' : ''}`}
    >
      <input {...getInputProps()} />
      <p>
        {isDragActive ?
          'Drop the GeoTIFF file here...' :
          `Drag & drop ${label} GeoTIFF file here, or click to select`
        }
      </p>
      <p><small>(.tif or .tiff files only)</small></p>
    </div>
  );
};

export default FileUpload;
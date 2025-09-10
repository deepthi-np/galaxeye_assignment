import React, { useState } from 'react';

const AOISelector = ({ onAoiChange, onReset, disabled }) => {
  const [aoi, setAoi] = useState({
    north: '',
    south: '',
    east: '',
    west: ''
  });

  const handleInputChange = (field, value) => {
    const newAoi = { ...aoi, [field]: parseFloat(value) || '' };
    setAoi(newAoi);
    
    // Check if all fields are filled
    if (newAoi.north && newAoi.south && newAoi.east && newAoi.west) {
      onAoiChange(newAoi);
    }
  };

  const handleReset = () => {
    setAoi({ north: '', south: '', east: '', west: '' });
    onReset();
  };

  return (
    <div className="aoi-selector">
      <h3>Area of Interest (AOI)</h3>
      
      <div className="form-group">
        <label>North Latitude:</label>
        <input
          type="number"
          step="0.000001"
          value={aoi.north}
          onChange={(e) => handleInputChange('north', e.target.value)}
          disabled={disabled}
          placeholder="e.g., 40.7128"
        />
      </div>
      
      <div className="form-group">
        <label>South Latitude:</label>
        <input
          type="number"
          step="0.000001"
          value={aoi.south}
          onChange={(e) => handleInputChange('south', e.target.value)}
          disabled={disabled}
          placeholder="e.g., 40.7028"
        />
      </div>
      
      <div className="form-group">
        <label>East Longitude:</label>
        <input
          type="number"
          step="0.000001"
          value={aoi.east}
          onChange={(e) => handleInputChange('east', e.target.value)}
          disabled={disabled}
          placeholder="e.g., -74.0060"
        />
      </div>
      
      <div className="form-group">
        <label>West Longitude:</label>
        <input
          type="number"
          step="0.000001"
          value={aoi.west}
          onChange={(e) => handleInputChange('west', e.target.value)}
          disabled={disabled}
          placeholder="e.g., -74.0160"
        />
      </div>
      
      <button 
        className="btn btn-secondary" 
        onClick={handleReset}
        disabled={disabled}
      >
        Reset AOI
      </button>
    </div>
  );
};

export default AOISelector;
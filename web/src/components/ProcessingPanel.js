import React, { useState } from 'react';

const ProcessingPanel = ({ imageA, imageB, aoi, onJobCreated }) => {
  const [method, setMethod] = useState('phase');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleProcess = async () => {
    if (!imageA || !imageB || !aoi) return;
    
    setIsProcessing(true);
    
    try {
      const response = await fetch('http://localhost:8080/api/jobs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageAId: imageA.imageId,
          imageBId: imageB.imageId,
          aoi,
          method
        }),
      });
      
      if (!response.ok) throw new Error('Processing failed');
      
      const data = await response.json();
      onJobCreated(data.jobId);
    } catch (error) {
      console.error('Processing error:', error);
      alert('Processing failed: ' + error.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="processing-panel">
      <h3>Processing Options</h3>
      
      <div className="form-group">
        <label>Alignment Method:</label>
        <select 
          value={method} 
          onChange={(e) => setMethod(e.target.value)}
          disabled={isProcessing}
        >
          <option value="phase">Phase Correlation (Faster)</option>
          <option value="feature">Feature Matching (More Accurate)</option>
        </select>
      </div>
      
      <button 
        className="btn btn-primary"
        onClick={handleProcess}
        disabled={!imageA || !imageB || !aoi || isProcessing}
      >
        {isProcessing ? 'Processing...' : 'Process AOI'}
      </button>
      
      <div className="info">
        <p><strong>Phase Correlation:</strong> Faster, good for simple translations</p>
        <p><strong>Feature Matching:</strong> Slower, handles rotation and scaling</p>
      </div>
    </div>
  );
};

export default ProcessingPanel;
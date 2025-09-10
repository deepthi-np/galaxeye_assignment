import React, { useState } from 'react';
import { ToastContainer, toast } from 'react-toastify';
import FileUpload from './components/FileUpload';
import MapView from './components/MapView';
import AOISelector from './components/AOISelector';
import ProcessingPanel from './components/ProcessingPanel';
import JobStatus from './components/JobStatus';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8080';

function App() {
  const [imageA, setImageA] = useState(null);
  const [imageB, setImageB] = useState(null);
  const [aoi, setAoi] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [showProcessed, setShowProcessed] = useState(false);

  const handleUpload = async (file, type) => {
    const formData = new FormData();
    formData.append('image', file);
    
    try {
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) throw new Error('Upload failed');
      
      const data = await response.json();
      
      if (type === 'A') {
        setImageA({ file, ...data });
      } else {
        setImageB({ file, ...data });
      }
      
      toast.success(`${file.name} uploaded successfully`);
    } catch (error) {
      toast.error(`Upload failed: ${error.message}`);
    }
  };

  const handleAoiChange = (newAoi) => {
    setAoi(newAoi);
  };

  const handleJobCreated = (newJobId) => {
    setJobId(newJobId);
    setShowProcessed(false);
    toast.success('Processing started');
  };

  const resetAoi = () => {
    setAoi(null);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>EO/SAR Split-View Map with AOI Clip & Align</h1>
      </header>
      
      <div className="container">
        <div className="upload-section">
          <FileUpload 
            label="Image A (Left)"
            onUpload={(file) => handleUpload(file, 'A')}
            disabled={jobId}
          />
          <FileUpload 
            label="Image B (Right)" 
            onUpload={(file) => handleUpload(file, 'B')}
            disabled={jobId}
          />
        </div>
        
        <div className="map-section">
          <MapView 
            imageA={showProcessed ? `${API_URL}/api/outputs/${jobId}/A_clipped.tif` : imageA}
            imageB={showProcessed ? `${API_URL}/api/outputs/${jobId}/B_clipped_aligned.tif` : imageB}
            aoi={aoi}
          />
          
          <div className="controls">
            <AOISelector 
              onAoiChange={handleAoiChange}
              onReset={resetAoi}
              disabled={!imageA || !imageB}
            />
            
            <ProcessingPanel 
              imageA={imageA}
              imageB={imageB}
              aoi={aoi}
              onJobCreated={handleJobCreated}
            />
          </div>
        </div>
        
        {jobId && (
          <div className="job-section">
            <JobStatus jobId={jobId} />
            
            <div className="processed-toggle">
              <label>
                <input 
                  type="checkbox" 
                  checked={showProcessed}
                  onChange={(e) => setShowProcessed(e.target.checked)}
                  disabled={!jobId}
                />
                Show processed outputs
              </label>
            </div>
          </div>
        )}
      </div>
      
      <ToastContainer position="bottom-right" />
    </div>
  );
}

export default App;
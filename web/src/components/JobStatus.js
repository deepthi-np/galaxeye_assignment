import React, { useState, useEffect } from 'react';

const JobStatus = ({ jobId }) => {
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!jobId) return;

    const pollJobStatus = async () => {
      try {
        const response = await fetch(`http://localhost:8080/api/jobs/${jobId}`);
        
        if (!response.ok) throw new Error('Failed to fetch job status');
        
        const jobData = await response.json();
        setJob(jobData);
        
        if (jobData.status === 'pending' || jobData.status === 'running') {
          setTimeout(pollJobStatus, 2000);
        }
      } catch (err) {
        setError(err.message);
      }
    };

    pollJobStatus();
  }, [jobId]);

  if (!jobId) return null;

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'status-completed';
      case 'running': return 'status-running';
      case 'error': return 'status-error';
      default: return 'status-pending';
    }
  };

  return (
    <div className="job-status">
      <h4>Job Status: <span className={getStatusColor(job?.status)}>
        {job?.status || 'loading...'}
      </span></h4>
      
      {job?.error && (
        <div className="error">Error: {job.error}</div>
      )}
      
      {job?.outputs && (
        <div className="output-links">
          <h5>Output Files:</h5>
          <a href={`http://localhost:8080${job.outputs.imageAUrl}`} target="_blank" rel="noopener noreferrer">
            📄 Clipped Image A
          </a>
          <a href={`http://localhost:8080${job.outputs.imageBUrl}`} target="_blank" rel="noopener noreferrer">
            📄 Aligned Image B
          </a>
          <a href={`http://localhost:8080${job.outputs.metadataUrl}`} target="_blank" rel="noopener noreferrer">
            📋 Processing Metadata
          </a>
        </div>
      )}
    </div>
  );
};

export default JobStatus;
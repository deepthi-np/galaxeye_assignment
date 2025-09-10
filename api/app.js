const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 8080;
const DATA_DIR = process.env.DATA_DIR || './data';
const MAX_FILE_SIZE = 4 * 1024 * 1024 * 1024; // 4GB

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Ensure data directories exist
fs.ensureDirSync(path.join(DATA_DIR, 'uploads'));
fs.ensureDirSync(path.join(DATA_DIR, 'outputs'));

// Configure multer for file uploads with large file support
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(DATA_DIR, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

// Custom file filter with better error handling
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.tif', '.tiff', '.TIF', '.TIFF'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Only GeoTIFF files (${allowedExtensions.join(', ')}) are allowed.`), false);
  }
};

// Create multer instance with large file support
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE, // 4GB max file size
    files: 2, // Max 2 files per request
  }
});

// Handle multer errors
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ 
        error: `File too large. Maximum size allowed is ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB` 
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ error: 'Too many files. Maximum 2 files allowed.' });
    }
  }
  next(error);
};

// In-memory job store
const jobs = new Map();

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'API is running',
    maxFileSize: `${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`,
    uploadDir: path.join(DATA_DIR, 'uploads')
  });
});

// Upload endpoint with progress tracking
app.post('/api/upload', (req, res) => {
  const uploadHandler = upload.single('image');
  
  uploadHandler(req, res, async (err) => {
    try {
      if (err) {
        if (err instanceof multer.MulterError) {
          return res.status(413).json({ 
            error: `Upload failed: ${err.message}`,
            code: err.code
          });
        }
        return res.status(400).json({ error: `Upload failed: ${err.message}` });
      }
      
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }
      
      console.log('File uploaded:', req.file.filename, 'Size:', req.file.size);
      
      // Use async file stats to avoid blocking
      const stats = await fs.stat(req.file.path);
      console.log('File stats:', stats.size, 'bytes');
      
      res.json({ 
        imageId: req.file.filename,
        originalName: req.file.originalname,
        size: stats.size,
        uploadedAt: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Upload processing error:', error);
      res.status(500).json({ 
        error: 'Upload processing failed',
        code: 'PROCESSING_ERROR'
      });
    }
  });
});

// Upload multiple files at once
app.post('/api/upload-multiple', (req, res) => {
  const uploadHandler = upload.array('images', 2);
  
  uploadHandler(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        return res.status(413).json({ 
          error: `Upload failed: ${err.message}`,
          code: err.code
        });
      }
      return res.status(400).json({ error: `Upload failed: ${err.message}` });
    }
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }
    
    const results = req.files.map(file => {
      const stats = fs.statSync(file.path);
      return {
        imageId: file.filename,
        originalName: file.originalname,
        size: stats.size,
        uploadedAt: new Date().toISOString()
      };
    });
    
    res.json(results);
  });
});

// Job creation
app.post('/api/jobs', async (req, res) => {
  try {
    const { imageAId, imageBId, aoi, method = 'phase' } = req.body;
    
    if (!imageAId || !imageBId || !aoi) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }
    
    if (!aoi.north || !aoi.south || !aoi.east || !aoi.west) {
      return res.status(400).json({ error: 'Invalid AOI format' });
    }
    
    const jobId = uuidv4();
    const jobDir = path.join(DATA_DIR, 'outputs', jobId);
    await fs.ensureDir(jobDir);
    
    const job = {
      id: jobId,
      imageAId,
      imageBId,
      aoi,
      method,
      status: 'pending',
      createdAt: new Date().toISOString(),
      outputDir: jobDir
    };
    
    jobs.set(jobId, job);
    processJob(job);
    
    res.json({ jobId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Job status
app.get('/api/jobs/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  res.json(job);
});

// List all jobs
app.get('/api/jobs', (req, res) => {
  const jobList = Array.from(jobs.values()).map(job => ({
    id: job.id,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt
  }));
  
  res.json(jobList);
});

// File serving endpoints
app.get('/api/outputs/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const filePath = path.join(DATA_DIR, 'outputs', jobId, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  
  // Set appropriate headers for large files
  res.setHeader('Content-Type', 'image/tiff');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  
  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

app.get('/api/outputs/:jobId/metadata.json', (req, res) => {
  const jobId = req.params.jobId;
  const filePath = path.join(DATA_DIR, 'outputs', jobId, 'metadata.json');
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Metadata not found' });
  }
  
  res.sendFile(filePath);
});

// Preview images
app.get('/api/previews/:jobId/:filename', (req, res) => {
  const { jobId, filename } = req.params;
  const filePath = path.join(DATA_DIR, 'outputs', jobId, filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Preview not found' });
  }
  
  res.setHeader('Content-Type', 'image/png');
  res.sendFile(filePath);
});

// Cleanup endpoint (optional)
app.delete('/api/jobs/:jobId', async (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);
  
  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }
  
  try {
    // Remove job outputs
    await fs.remove(job.outputDir);
    jobs.delete(jobId);
    
    res.json({ message: 'Job and outputs deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process job function

// Process job function
function processJob(job) {
  job.status = 'running';
  jobs.set(job.id, job);
  
  const imageAPath = path.join(DATA_DIR, 'uploads', job.imageAId);
  const imageBPath = path.join(DATA_DIR, 'uploads', job.imageBId);
  
  // Convert AOI to string format (not JSON)
  const aoiString = `north=${job.aoi.north};south=${job.aoi.south};east=${job.aoi.east};west=${job.aoi.west}`;
  
  /* const cwd = process.cwd();
  console.log('Current working directory:', cwd);
  try {
    const files = fs.readdirSync(cwd);
    console.log('Files in current directory:', files);
  } catch (err) {
    console.error('Error reading current directory:', err);
  } */
  
  console.log("docker exec galaxeye_assignment-worker-1 python3 worker.py --image_a "+imageAPath+" --image_b "+imageBPath+" --aoi "+aoiString+" --out_dir "+ job.outputDir+" --method "+ (job.method || 'phase'))
  const pythonProcess = spawn('docker', [
    'exec',
    'galaxeye_assignment-worker-1',
    'python3',
    'worker.py',
    '--image_a', imageAPath,
    '--image_b', imageBPath,
    '--aoi', aoiString,
    '--out_dir', job.outputDir,
    '--method', job.method || 'phase'
  ], {
    cwd: process.cwd(),
    env: { ...process.env, DOCKER_HOST: 'unix:///var/run/docker.sock' }
  });
  
  let stdoutData = '';
  let stderrData = '';
  
  pythonProcess.stdout.on('data', (data) => {
    stdoutData += data.toString();
    console.log(`Worker stdout: ${data}`);
  });
  
  pythonProcess.stderr.on('data', (data) => {
    stderrData += data.toString();
    console.error(`Worker stderr: ${data}`);
  });
  
  pythonProcess.on('close', (code) => {
    if (code === 0) {
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      
      // Check if output files exist
      const outputFiles = {};
      const expectedFiles = [
        'A_clipped.tif', 'B_clipped.tif', 'B_clipped_aligned.tif',
        'A_preview.png', 'B_preview.png', 'A_clipped_preview.png', 'B_aligned_preview.png',
        'metadata.json'
      ];
      
      expectedFiles.forEach(file => {
        const filePath = path.join(job.outputDir, file);
        if (fs.existsSync(filePath)) {
          outputFiles[file] = `/api/outputs/${job.id}/${file}`;
        }
      });
      
      job.outputs = outputFiles;
      job.logs = {
        stdout: stdoutData,
        stderr: stderrData
      };
    } else {
      job.status = 'error';
      job.error = `Process exited with code ${code}`;
      job.logs = {
        stdout: stdoutData,
        stderr: stderrData
      };
    }
    
    jobs.set(job.id, job);
  });
}

// Use multer error handler
app.use(handleMulterError);

// General error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT,'0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Maximum file size: ${MAX_FILE_SIZE / (1024 * 1024 * 1024)}GB`);
  console.log(`Upload directory: ${path.join(DATA_DIR, 'uploads')}`);
});
# Split-View Map Application

A web application for processing and aligning EO/SAR geospatial imagery.

## Features

- Upload two GeoTIFF images
- Preview in split-view map
- Draw Area of Interest (AOI) rectangle
- Process images: clip to AOI and align Image B to Image A
- Visualize processed outputs

## Setup

1. Ensure Docker and Docker Compose are installed
2. Clone this repository
3. Run: `docker-compose up --build`
4. Open http://localhost:3000 in your browser

## Usage

1. Upload two GeoTIFF images (Image A and Image B)
2. Draw an AOI rectangle on the map
3. Select alignment method
4. Click "Process AOI" to start processing
5. View results and download processed files

## API Endpoints

- POST `/api/upload` - Upload GeoTIFF file
- POST `/api/jobs` - Create processing job
- GET `/api/jobs/:jobId` - Get job status
- GET `/api/outputs/:jobId/:filename` - Download processed file

## Technical Details

- Frontend: React with Leaflet maps
- Backend: Node.js/Express API
- Processing: Python with rasterio, scikit-image, OpenCV
- Alignment Methods: Phase Correlation and Feature Matching
import React, { forwardRef, useImperativeHandle, useState, useEffect } from 'react';
import { MapContainer, TileLayer, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Split map implementation
const SplitViewMap = forwardRef(({ imageA, imageB, aoi }, ref) => {
  const [map, setMap] = useState(null);
  const [leftLayer, setLeftLayer] = useState(null);
  const [rightLayer, setRightLayer] = useState(null);
  const [aoiLayer, setAoiLayer] = useState(null);

  useImperativeHandle(ref, () => ({
    getMap: () => map
  }));

  // Load and display images
  useEffect(() => {
    if (!map) return;

    // Remove existing layers
    if (leftLayer) {
      map.removeLayer(leftLayer);
    }
    if (rightLayer) {
      map.removeLayer(rightLayer);
    }

    // Load new images
    if (imageA) {
      const url = typeof imageA === 'string' 
        ? `http://localhost:8080${imageA}` 
        : URL.createObjectURL(imageA.file);
      
      const layer = L.imageOverlay(url, [[-90, -180], [90, 180]]);
      layer.addTo(map);
      setLeftLayer(layer);
    }

    if (imageB) {
      const url = typeof imageB === 'string' 
        ? `http://localhost:8080${imageB}` 
        : URL.createObjectURL(imageB.file);
      
      const layer = L.imageOverlay(url, [[-90, -180], [90, 180]]);
      layer.addTo(map);
      setRightLayer(layer);
    }
  }, [map, imageA, imageB]);

  // Update AOI rectangle
  useEffect(() => {
    if (!map || !aoi) return;

    // Remove existing AOI layer
    if (aoiLayer) {
      map.removeLayer(aoiLayer);
    }

    // Create new AOI rectangle
    const bounds = [
      [aoi.south, aoi.west],
      [aoi.north, aoi.east]
    ];
    
    const newAoiLayer = L.rectangle(bounds, {
      color: '#ff7800',
      weight: 2,
      fillOpacity: 0.1
    }).addTo(map);
    
    setAoiLayer(newAoiLayer);
    
    // Zoom to AOI
    map.fitBounds(bounds);
  }, [map, aoi]);

  return (
    <div className="split-map-container">
      <MapContainer
        center={[0, 0]}
        zoom={2}
        style={{ height: '500px', width: '100%' }}
        whenCreated={setMap}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </div>
  );
});

export default SplitViewMap;
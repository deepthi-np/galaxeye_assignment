import React, { useEffect, useRef } from 'react';
import L from 'leaflet';

const MapView = ({ imageA, imageB, aoi }) => {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const imageLayers = useRef([]);

  useEffect(() => {
    // Initialize map
    if (!mapRef.current) return;

    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current).setView([0, 0], 2);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
      }).addTo(mapInstance.current);
    }

    // Clear existing image layers
    imageLayers.current.forEach(layer => {
      if (mapInstance.current && layer) {
        mapInstance.current.removeLayer(layer);
      }
    });
    imageLayers.current = [];

    // Add Image A if available
    if (imageA) {
      const url = typeof imageA === 'string' ? imageA : URL.createObjectURL(imageA.file);
      const bounds = [[-90, -180], [90, 180]]; // Default bounds
      const layer = L.imageOverlay(url, bounds).addTo(mapInstance.current);
      imageLayers.current.push(layer);
    }

    // Add Image B if available
    if (imageB) {
      const url = typeof imageB === 'string' ? imageB : URL.createObjectURL(imageB.file);
      const bounds = [[-90, -180], [90, 180]]; // Default bounds
      const layer = L.imageOverlay(url, bounds).addTo(mapInstance.current);
      imageLayers.current.push(layer);
    }

    // Fit bounds to images or AOI
    if (aoi) {
      const bounds = [
        [aoi.south, aoi.west],
        [aoi.north, aoi.east]
      ];
      mapInstance.current.fitBounds(bounds);
    } else if (imageLayers.current.length > 0) {
      mapInstance.current.fitBounds(imageLayers.current[0].getBounds());
    }

  }, [imageA, imageB, aoi]);

  return (
    <div className="map-container">
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
    </div>
  );
};

export default MapView;
#!/usr/bin/env python3

import argparse
import os
import json
import numpy as np
import rasterio
from rasterio.mask import mask
from rasterio.warp import calculate_default_transform, reproject, Resampling
from skimage.registration import phase_cross_correlation
from scipy.ndimage import shift
import cv2
from PIL import Image
import tempfile
import traceback
import ast
from pyproj import Transformer, CRS
import pyproj

def parse_aoi(aoi_string):
    """Parse AOI string into dictionary"""
    try:
        # Try to parse as JSON first
        if aoi_string.strip().startswith('{'):
            return json.loads(aoi_string)
        
        # Try to parse as string representation of dict
        if aoi_string.strip().startswith('{'):
            return ast.literal_eval(aoi_string)
        
        # Parse as key=value;key=value format
        aoi_dict = {}
        for item in aoi_string.split(';'):
            if '=' in item:
                key, value = item.split('=', 1)
                aoi_dict[key.strip()] = float(value.strip())
        return aoi_dict
        
    except (json.JSONDecodeError, ValueError, SyntaxError) as e:
        print(f"Warning: Could not parse AOI string: {aoi_string}")
        print(f"Error: {e}")
        return None

def get_image_bounds(image_path):
    """Get the geographic bounds of an image"""
    try:
        with rasterio.open(image_path) as src:
            return {
                'north': src.bounds.top,
                'south': src.bounds.bottom,
                'east': src.bounds.right,
                'west': src.bounds.left
            }
    except Exception as e:
        print(f"Error getting image bounds: {e}")
        return None

def get_image_crs(image_path):
    """Get the CRS of an image"""
    try:
        with rasterio.open(image_path) as src:
            return src.crs
    except Exception as e:
        print(f"Error getting image CRS: {e}")
        return None

def is_geographic_coords(coord_dict):
    """Check if coordinates are in geographic system (lat/lon)"""
    try:
        return (abs(coord_dict['north']) <= 90 and 
                abs(coord_dict['south']) <= 90 and 
                abs(coord_dict['east']) <= 180 and 
                abs(coord_dict['west']) <= 180)
    except (KeyError, TypeError):
        return False

def convert_aoi_to_image_crs(aoi, image_path):
    """Convert AOI from geographic coordinates to image's CRS"""
    try:
        with rasterio.open(image_path) as src:
            if src.crs is None:
                print("Image has no CRS, cannot convert coordinates")
                return aoi
                
            # Transform AOI from geographic to image CRS
            transformer = Transformer.from_crs("EPSG:4326", src.crs, always_xy=True)
            
            # Transform bounds
            west, south = transformer.transform(aoi['west'], aoi['south'])
            east, north = transformer.transform(aoi['east'], aoi['north'])
            
            return {
                'north': north,
                'south': south,
                'east': east,
                'west': west
            }
            
    except Exception as e:
        print(f"Error converting AOI: {e}")
        traceback.print_exc()
        return aoi

def get_image_geographic_bounds(image_path):
    """Get image bounds in geographic coordinates (WGS84)"""
    try:
        with rasterio.open(image_path) as src:
            if src.crs is None:
                print("Image has no CRS, cannot convert to geographic")
                return get_image_bounds(image_path)
                
            # Transform bounds to WGS84
            left, bottom, right, top = src.bounds
            transformer = Transformer.from_crs(src.crs, "EPSG:4326", always_xy=True)
            
            west, south = transformer.transform(left, bottom)
            east, north = transformer.transform(right, top)
            
            return {
                'north': north,
                'south': south,
                'east': east,
                'west': west
            }
    except Exception as e:
        print(f"Error getting geographic bounds: {e}")
        return get_image_bounds(image_path)

def clip_image_to_aoi(image_path, aoi, output_path):
    """Clip image to AOI bounds with coordinate system handling"""
    try:
        with rasterio.open(image_path) as src:
            # Check if AOI needs coordinate conversion
            image_bounds = get_image_bounds(image_path)
            image_crs = get_image_crs(image_path)
            
            print(f"Image CRS: {image_crs}")
            print(f"Image bounds: {image_bounds}")
            print(f"AOI bounds: {aoi}")
            
            # If AOI is geographic but image is projected, convert AOI
            if (is_geographic_coords(aoi) and 
                image_crs and 
                not image_crs.is_geographic and
                (abs(image_bounds['north']) > 90 or abs(image_bounds['south']) > 90)):
                
                print("Converting AOI from geographic to projected coordinates")
                converted_aoi = convert_aoi_to_image_crs(aoi, image_path)
                if converted_aoi:
                    aoi = converted_aoi
                    print(f"Converted AOI: {aoi}")
                else:
                    print("AOI conversion failed, using image bounds")
                    aoi = image_bounds
            
            # Create a polygon geometry from AOI bounds
            aoi_polygon = [{
                'type': 'Polygon',
                'coordinates': [[
                    [aoi['west'], aoi['south']],
                    [aoi['east'], aoi['south']],
                    [aoi['east'], aoi['north']],
                    [aoi['west'], aoi['north']],
                    [aoi['west'], aoi['south']]
                ]]
            }]
            
            print(f"AOI polygon: {aoi_polygon}")
            
            # Clip the image using the polygon
            out_image, out_transform = mask(src, aoi_polygon, crop=True, all_touched=True)
            
            # Update metadata
            out_meta = src.meta.copy()
            out_meta.update({
                "height": out_image.shape[1],
                "width": out_image.shape[2],
                "transform": out_transform
            })
            
            # Write clipped image
            with rasterio.open(output_path, "w", **out_meta) as dest:
                dest.write(out_image)
                
        print(f"Clipped image saved to: {output_path}")
        return True
        
    except Exception as e:
        print(f"Error clipping image {image_path}: {e}")        
        traceback.print_exc()
        return False

def align_images_phase_correlation(image_a_path, image_b_path, output_path):
    """Align Image B to Image A using phase correlation"""
    try:
        with rasterio.open(image_a_path) as src_a, rasterio.open(image_b_path) as src_b:
            # Read first band for alignment
            band_a = src_a.read(1)
            band_b = src_b.read(1)
            
            # Handle no-data values
            band_a = np.nan_to_num(band_a, nan=0.0)
            band_b = np.nan_to_num(band_b, nan=0.0)
            
            # Normalize images for better correlation
            band_a_norm = (band_a - np.mean(band_a)) / (np.std(band_a) + 1e-10)
            band_b_norm = (band_b - np.mean(band_b)) / (np.std(band_b) + 1e-10)
            
            # Calculate shift using phase cross correlation
            shift_vector, error, diffphase = phase_cross_correlation(
                band_a_norm, band_b_norm, normalization=None
            )
            
            print(f"Detected shift: {shift_vector}, error: {error}")
            
            # Read all bands from Image B
            b_data = src_b.read()
            aligned_data = np.zeros_like(b_data)
            
            # Apply shift to each band
            for i in range(src_b.count):
                band_data = src_b.read(i + 1)
                band_data = np.nan_to_num(band_data, nan=0.0)
                aligned_band = shift(band_data, shift_vector, mode='constant', cval=0.0)
                aligned_data[i] = aligned_band
            
            # Update metadata
            out_meta = src_b.meta.copy()
            
            # Save aligned image
            with rasterio.open(output_path, "w", **out_meta) as dest:
                dest.write(aligned_data)
                
        return True, shift_vector.tolist() if hasattr(shift_vector, 'tolist') else shift_vector
        
    except Exception as e:
        print(f"Error aligning images: {e}")
        traceback.print_exc()
        return False, None

def align_images_feature_based(image_a_path, image_b_path, output_path):
    """Align Image B to Image A using feature matching"""
    try:
        with rasterio.open(image_a_path) as src_a, rasterio.open(image_b_path) as src_b:
            # Read first band for feature detection
            band_a = src_a.read(1)
            band_b = src_b.read(1)
            
            # Convert to uint8 for OpenCV
            band_a_8bit = ((band_a - band_a.min()) / (band_a.max() - band_a.min() + 1e-10) * 255).astype('uint8')
            band_b_8bit = ((band_b - band_b.min()) / (band_b.max() - band_b.min() + 1e-10) * 255).astype('uint8')
            
            # Initialize ORB detector
            orb = cv2.ORB_create(nfeatures=500)
            
            # Find keypoints and descriptors
            kp1, des1 = orb.detectAndCompute(band_a_8bit, None)
            kp2, des2 = orb.detectAndCompute(band_b_8bit, None)
            
            if des1 is None or des2 is None:
                print("Not enough features found for matching")
                return False, None
            
            # BFMatcher with Hamming distance
            bf = cv2.BFMatcher(cv2.NORM_HAMMING, crossCheck=True)
            matches = bf.match(des1, des2)
            
            if not matches:
                print("No matches found")
                return False, None
            
            # Sort matches by distance
            matches = sorted(matches, key=lambda x: x.distance)
            
            # Extract matched keypoints
            src_pts = np.float32([kp1[m.queryIdx].pt for m in matches]).reshape(-1, 1, 2)
            dst_pts = np.float32([kp2[m.trainIdx].pt for m in matches]).reshape(-1, 1, 2)
            
            # Find homography matrix
            M, mask = cv2.findHomography(dst_pts, src_pts, cv2.RANSAC, 5.0)
            
            if M is None:
                print("Homography matrix could not be computed")
                return False, None
            
            # Read all bands from Image B
            b_data = src_b.read()
            aligned_data = np.zeros_like(b_data)
            
            # Warp each band
            for i in range(src_b.count):
                band_data = src_b.read(i + 1)
                band_data = np.nan_to_num(band_data, nan=0.0)
                aligned_band = cv2.warpPerspective(band_data, M, (band_data.shape[1], band_data.shape[0]))
                aligned_data[i] = aligned_band
            
            # Update metadata
            out_meta = src_b.meta.copy()
            
            # Save aligned image
            with rasterio.open(output_path, "w", **out_meta) as dest:
                dest.write(aligned_data)
                
        return True, M.tolist() if hasattr(M, 'tolist') else M
        
    except Exception as e:
        print(f"Error in feature-based alignment: {e}")
        traceback.print_exc()
        return False, None

def create_preview_image(input_path, output_path, size=(500, 500)):
    """Create a preview image for web display"""
    try:
        with rasterio.open(input_path) as src:
            # Read first band
            data = src.read(1)
            
            # Normalize and convert to uint8
            data_normalized = ((data - np.nanmin(data)) / (np.nanmax(data) - np.nanmin(data) + 1e-10) * 255).astype('uint8')
            
            # Create PIL image
            img = Image.fromarray(data_normalized)
            
            # Resize for web preview
            img = img.resize(size, Image.Resampling.LANCZOS)
            
            # Save as PNG
            img.save(output_path, 'PNG')
            
        return True
    except Exception as e:
        print(f"Error creating preview image: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Process and align EO/SAR images')
    # parser.add_argument('--image_a', required=True, help='Path to Image A')
    # parser.add_argument('--image_b', required=True, help='Path to Image B')
    # parser.add_argument('--aoi', required=True, help='AOI in JSON format or key=value pairs')
    # parser.add_argument('--out_dir', required=True, help='Output directory')
    # parser.add_argument('--method', default='phase', choices=['phase', 'feature'], help='Alignment method')
    parser.add_argument('--image_a', help='Path to Image A')
    parser.add_argument('--image_b', help='Path to Image B')
    parser.add_argument('--aoi', help='AOI in JSON format or key=value pairs')
    parser.add_argument('--out_dir', help='Output directory')
    parser.add_argument('--method', default='phase', choices=['phase', 'feature'], help='Alignment method')
    
    args = parser.parse_args()
    
    print(f"Starting processing with:")
    print(f"  Image A: {args.image_a}")
    print(f"  Image B: {args.image_b}")
    print(f"  AOI: {args.aoi}")
    print(f"  Output dir: {args.out_dir}")
    print(f"  Method: {args.method}")
    
    # Check if input files exist
    if not os.path.exists(args.image_a):
        print(f"Error: Image A not found at {args.image_a}")
        return 1
        
    if not os.path.exists(args.image_b):
        print(f"Error: Image B not found at {args.image_b}")
        return 1
    
    # Create output directory
    os.makedirs(args.out_dir, exist_ok=True)
    
    # Parse AOI
    aoi = parse_aoi(args.aoi)
    if aoi is None:
        print("Error: Could not parse AOI, using image bounds")
        aoi = get_image_bounds(args.image_a)
        if aoi is None:
            print("Fatal: Could not get image bounds")
            return 1
    
    print(f"Parsed AOI: {aoi}")
    
    # Get image bounds for reference
    bounds_a = get_image_bounds(args.image_a)
    bounds_b = get_image_bounds(args.image_b)
    print(f"Image A bounds: {bounds_a}")
    print(f"Image B bounds: {bounds_b}")
    
    # Get geographic bounds for comparison
    geo_bounds_a = get_image_geographic_bounds(args.image_a)
    geo_bounds_b = get_image_geographic_bounds(args.image_b)
    print(f"Image A geographic bounds: {geo_bounds_a}")
    print(f"Image B geographic bounds: {geo_bounds_b}")
    
    # Define output paths
    a_clipped_path = os.path.join(args.out_dir, 'A_clipped.tif')
    b_clipped_path = os.path.join(args.out_dir, 'B_clipped.tif')
    b_aligned_path = os.path.join(args.out_dir, 'B_clipped_aligned.tif')
    
    # Create preview images
    a_preview_path = os.path.join(args.out_dir, 'A_preview.png')
    b_preview_path = os.path.join(args.out_dir, 'B_preview.png')
    a_clipped_preview_path = os.path.join(args.out_dir, 'A_clipped_preview.png')
    b_aligned_preview_path = os.path.join(args.out_dir, 'B_aligned_preview.png')
    
    # Clip images to AOI
    print("Clipping Image A...")
    if not clip_image_to_aoi(args.image_a, aoi, a_clipped_path):
        print("Failed to clip Image A, using original image")
        a_clipped_path = args.image_a
    
    print("Clipping Image B...")
    if not clip_image_to_aoi(args.image_b, aoi, b_clipped_path):
        print("Failed to clip Image B, using original image")
        b_clipped_path = args.image_b
    
    # Align Image B to Image A
    print(f"Aligning Image B to Image A using {args.method} method...")
    
    if args.method == 'phase':
        success, transform = align_images_phase_correlation(a_clipped_path, b_clipped_path, b_aligned_path)
    else:
        success, transform = align_images_feature_based(a_clipped_path, b_clipped_path, b_aligned_path)
    
    if not success:
        print("Alignment failed, using clipped images without alignment")
        b_aligned_path = b_clipped_path
    
    # Create preview images
    print("Creating preview images...")
    create_preview_image(args.image_a, a_preview_path)
    create_preview_image(args.image_b, b_preview_path)
    create_preview_image(a_clipped_path, a_clipped_preview_path)
    create_preview_image(b_aligned_path, b_aligned_preview_path)
    
    # Create metadata file
    metadata = {
        'image_a_original': args.image_a,
        'image_b_original': args.image_b,
        'aoi': aoi,
        'alignment_method': args.method,
        'transform': transform,
        'image_bounds': {
            'image_a': bounds_a,
            'image_b': bounds_b
        },
        'geographic_bounds': {
            'image_a': geo_bounds_a,
            'image_b': geo_bounds_b
        },
        'output_files': {
            'image_a_clipped': a_clipped_path,
            'image_b_clipped': b_clipped_path,
            'image_b_aligned': b_aligned_path,
            'previews': {
                'a_original': a_preview_path,
                'b_original': b_preview_path,
                'a_clipped': a_clipped_preview_path,
                'b_aligned': b_aligned_preview_path
            }
        },
        'status': 'completed' if success else 'completed_with_warning'
    }
    
    with open(os.path.join(args.out_dir, 'metadata.json'), 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print("Processing completed successfully!")
    print(f"Output files created in: {args.out_dir}")
    return 0

if __name__ == '__main__':
    exit(main())

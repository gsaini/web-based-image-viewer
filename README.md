# OpenSeadragon Server

![Javascript](https://img.shields.io/badge/javascript-%23323330.svg?style=for-the-badge&logo=javascript&logoColor=%23F7DF1E)
![HTML5](https://img.shields.io/badge/html5-%23E34F26.svg?style=for-the-badge&logo=html5&logoColor=white)
![CSS](https://img.shields.io/badge/css-%231572B6.svg?style=for-the-badge&logo=css3&logoColor=white)
![Node.js](https://img.shields.io/badge/node.js-%23339933.svg?style=for-the-badge&logo=node.js&logoColor=white)
![Openseadragon](https://img.shields.io/badge/openseadragon-%23000000.svg?style=for-the-badge&logo=openseadragon&logoColor=white)
![GeoTiff](https://img.shields.io/badge/geotiff-%23FF6F00.svg?style=for-the-badge&logo=geotiff&logoColor=white)
![pnpm](https://img.shields.io/badge/pnpm-%231C7C54.svg?style=for-the-badge&logo=pnpm&logoColor=white)
![vips](https://img.shields.io/badge/vips-%23FF6F00.svg?style=for-the-badge&logo=vips&logoColor=white)

This project sets up a simple server to serve zoomable images using OpenSeadragon. It supports loading Deep Zoom Image (DZI) files via file upload or URL, and includes performance tracking for image load times.

## Project Structure

```
openseadragon-server
├── public
│   ├── index.html            # Main HTML file for displaying the zoomable image
│   ├── demo.js               # Demo script for advanced TIFF/DZI loading
│   ├── openseadragon.min.js  # OpenSeadragon library
│   ├── output_folder_philips.dzi  # Example DZI file
│   ├── Philips-1.tiff        # Example TIFF file
│   ├── test.html             # (Optional) Test HTML file
│   └── output_folder_philips_files/ # DZI tile images folder
├── src
│   └── server.js             # Node.js server setup
├── package.json              # npm configuration file
├── pnpm-lock.yaml            # pnpm lock file (if using pnpm)
└── README.md                 # Project documentation
```

## Features
- Load DZI files via file picker or URL input
- Performance tracking: logs time from viewer initialization to image display
- Simple Node.js static file server

## Getting Started

### Prerequisites
- Node.js (version 12 or higher)
- npm (Node package manager)

### Installation

1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd openseadragon-server
   ```

2. Install the dependencies:
   ```sh
   npm install
   ```

### Running the Server

To start the server, run the following command:
```sh
npm start
```

The server will be running at `http://localhost:3000`. Open this URL in your web browser.

### Using the Viewer
- Use the file picker to load a local DZI file, or enter a URL to a DZI file and click "Load from link".
- The viewer will display the image and log performance metrics to the browser console.

### Notes
- To view your own images, convert them to DZI format (e.g., using VIPS or deepzoom.py) and place the `.dzi` file and its associated folder in the `public/` directory.
- TIFF/GeoTIFF direct loading is not supported in the browser due to plugin limitations. Convert to DZI for best results.

## Converting TIFF to DZI (Deep Zoom Image) with VIPS

To use your `.tiff` files with OpenSeadragon, convert them to the Deep Zoom Image (DZI) format using the `vips` tool. Below are step-by-step instructions for different platforms and automation options.

### 1. Install VIPS

**On macOS (using Homebrew):**
```bash
brew install vips
```

**On Ubuntu/Linux:**
```bash
sudo apt update
sudo apt install libvips-tools
```

### 2. Manual VIPS CLI Command

Convert a TIFF file to DZI format:
```bash
vips dzsave input.tif output_folder
```
This will create:
- `output_folder.dzi` (XML metadata file)
- `output_folder_files/` (contains all tile images)

### 3. Automate with Python

```python
import subprocess
import os

def convert_tif_to_dzi(tif_path, output_name):
    if not os.path.exists(tif_path):
        raise FileNotFoundError(f"{tif_path} does not exist")

    output_dir = os.path.splitext(output_name)[0]
    command = ["vips", "dzsave", tif_path, output_dir]
    
    try:
        subprocess.run(command, check=True)
        print(f"✅ Converted {tif_path} → {output_dir}.dzi")
    except subprocess.CalledProcessError as e:
        print(f"❌ Error: {e}")

# Example
convert_tif_to_dzi("my_image.tif", "my_image_output")
```

### 4. Automate with Node.js

```js
const { exec } = require("child_process");
const path = require("path");

function convertTifToDzi(inputPath, outputName) {
  const outputDir = path.basename(outputName, path.extname(outputName));
  const cmd = `vips dzsave "${inputPath}" "${outputDir}"`;

  exec(cmd, (err, stdout, stderr) => {
    if (err) {
      console.error("❌ Error:", stderr);
    } else {
      console.log(`✅ Converted to ${outputDir}.dzi`);
    }
  });
}

// Example
convertTifToDzi("my_image.tif", "my_output");
```

### 5. Batch Conversion Script (Bash)

```bash
#!/bin/bash

mkdir -p dzi_output
for file in *.tif; do
  name="${file%.*}"
  echo "Converting $file..."
  vips dzsave "$file" "dzi_output/$name"
done
```

### 📂 Output Structure Example

```
my_image_output.dzi
my_image_output_files/
  ├── 0/0_0.jpeg
  ├── 1/0_0.jpeg
  └── ...
```

You can now serve it with a local web server (e.g., `python3 -m http.server`) and load it into OpenSeadragon using:

```js
tileSources: "http://localhost:8000/my_image_output.dzi"
```

Refer to the `public/` folder for example DZI files and structure.

### License

This project is licensed under the MIT License.
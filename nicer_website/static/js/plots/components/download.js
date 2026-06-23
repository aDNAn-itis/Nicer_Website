import { startOperation, completeOperation, errorOperation } from './statusBar.js';

export async function downloadData(
  dataType,
  obsId,
  filePath = null,
  gtiNumbers = null,
  quality
) {
  // Start status tracking for download
  const operationId = 'download-' + Date.now();
  let downloadDescription = 'Preparing download';
  
  if (dataType === 'gti' && gtiNumbers && gtiNumbers.length > 0) {
    downloadDescription = 'Downloading GTI ' + gtiNumbers.join(', ') + ' data for observation ' + obsId;
  } else {
    downloadDescription = 'Downloading ' + dataType + ' data for observation ' + obsId;
  }
  
  startOperation(operationId, downloadDescription + '...');
  
  try {
    console.log('Download called with:', {
      dataType,
      obsId,
      filePath,
      gtiNumbers,
      quality
    }); 

    const params = new URLSearchParams({
      type: dataType,
      obs_id: obsId,
      quality: quality
    });
    if (filePath) {
      params.append('file_path', filePath);
    }
    if (gtiNumbers && gtiNumbers.length > 0) {
      params.append('gti_numbers', gtiNumbers.join(','));
    }


    const response = await fetch(`/plots/download?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Download failed with status:', response.status);
      console.error('Error response:', errorText);
      throw new Error(
        errorText || `Download failed with status ${response.status}`,
      );
    }

    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1].replace(/"/g, '')
      : `${obsId}_${dataType}${
          gtiNumbers ? '_GTI_' + gtiNumbers.join('-') : ''
        }.fits`;

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    
    completeOperation(operationId, 'Successfully downloaded ' + filename);
  } catch (error) {
    console.error('Download failed:', error);
    errorOperation(operationId, 'Download failed: ' + error.message);
    alert(`Failed to download data: ${error.message}`);
  }
}
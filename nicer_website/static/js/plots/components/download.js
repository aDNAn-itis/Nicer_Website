export async function downloadData(
  dataType,
  obsId,
  filePath = null,
  gtiNumbers = null,
) {
  try {
    console.log('Download called with:', {
      dataType,
      obsId,
      filePath,
      gtiNumbers,
    }); // Debug log

    const params = new URLSearchParams({
      type: dataType,
      obs_id: obsId,
    });
    if (filePath) {
      params.append('file_path', filePath);
    }
    if (gtiNumbers && gtiNumbers.length > 0) {
      params.append('gti_numbers', gtiNumbers.join(','));
    }

    console.log('Request URL params:', params.toString()); // Debug log

    const response = await fetch(`/plots/download?${params}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Download failed with status:', response.status);
      console.error('Error response:', errorText);
      throw new Error(
        errorText || `Download failed with status ${response.status}`,
      );
    }

    // Get filename from Content-Disposition header
    const contentDisposition = response.headers.get('Content-Disposition');
    const filename = contentDisposition
      ? contentDisposition.split('filename=')[1].replace(/"/g, '')
      : `${obsId}_${dataType}${
          gtiNumbers ? '_GTI_' + gtiNumbers.join('-') : ''
        }.fits`;

    console.log(`Downloading file: ${filename}`);

    // Create blob and trigger download
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  } catch (error) {
    console.error('Download failed:', error);
    alert(`Failed to download data: ${error.message}`);
  }
}

"""
Misc functions used elsewhere
"""
import numpy as np
from numpy import ndarray


def min_bin(min_value: int, data: ndarray) -> ndarray:
    """
    Calculates the bin indices to ensure each bin has the minimum number of counts.

    Parameters
    ----------
    min_value : integer
        Minimum value for each bin
    data : ndarray
        Data to measure the bin counts

    Returns
    -------
    ndarray
        Bin indices
    """
    if len(data) == 0:
        return np.array([0])
    
    if min_value <= 0:
        return np.arange(len(data) + 1)
    
    i: int
    bin_counts: float
    count: float = 0.0
    bins: ndarray = np.array([0])

    for i, bin_counts in enumerate(data[:-1]):
        count += bin_counts

        if count >= min_value:
            bins = np.append(bins, i + 1)
            count = 0.0

    # Handle the last bin - if it's too small, merge with previous bin
    if len(data) > 0:
        if data[-1] < min_value and len(bins) > 1:
            # Don't create a new bin, extend the last one
            bins[-1] = len(data)
        else:
            # Create final bin
            bins = np.append(bins, len(data))

    # Ensure we have at least one bin
    if len(bins) < 2:
        bins = np.array([0, len(data)])

    return bins


def binning(
        bins: ndarray,
        data: ndarray,
        weights: ndarray | None = None) -> tuple[ndarray, ndarray, ndarray]:
    """
    Bin data into bins.

    Parameters
    ----------
    bins : ndarray
        Array of bin edges
    data : ndarray
        Data to bin, can be 2D where the rows correspond to different datasets
        and the first row is used to determine binning
    weights : ndarray, default = None
        Widths of the bins in x-units

    Returns
    -------
    tuple[ndarray, ndarray, ndarray]
        Binned data, bin widths and Poisson uncertainty
    """
    if len(bins) < 2:
        raise ValueError("Need at least 2 bin edges")
    
    bin_width: float
    bin_counts: float
    data_bin: ndarray
    uncertainty: ndarray
    bin_widths: ndarray = np.array(())

    # Swaps axes for easier indexing and ensures data is 2D
    if len(data.shape) > 1:
        data = data.swapaxes(0, 1)
    else:
        data = data[:, np.newaxis]

    # Check if data is empty
    if data.shape[0] == 0:
        return np.array([]), np.array([]), np.array([])

    data_bin = np.empty((0, data.shape[1]))
    uncertainty = np.empty((0, data.shape[1]))

    if weights is None:
        weights = np.ones(data.shape[0])

    data = data * weights[:, np.newaxis]

    # Loop through array except for the last bin, and bins data
    for i, idx in enumerate(bins[:-1]):
        end_idx = bins[i + 1]
        
        # Ensure indices are within bounds
        idx = max(0, min(idx, data.shape[0] - 1))
        end_idx = max(idx + 1, min(end_idx, data.shape[0]))
        
        bin_width = np.sum(weights[idx:end_idx])
        bin_counts = np.sum(data[idx:end_idx], axis=0)

        bin_widths = np.append(bin_widths, bin_width)
        
        # Avoid division by zero
        if bin_width > 0:
            data_bin = np.vstack((data_bin, bin_counts / bin_width))
            uncertainty = np.vstack((uncertainty, np.sqrt(np.maximum(bin_counts, 1)) / bin_width))
        else:
            # Handle zero-width bins
            data_bin = np.vstack((data_bin, bin_counts))
            uncertainty = np.vstack((uncertainty, np.sqrt(np.maximum(bin_counts, 1))))

    # Revert shape to input
    if data_bin.shape[1] != 1:
        data_bin = data_bin.swapaxes(0, 1)
        uncertainty = uncertainty.swapaxes(0, 1)
    else:
        data_bin = data_bin[:, 0]
        uncertainty = uncertainty[:, 0]

    return data_bin, bin_widths, uncertainty

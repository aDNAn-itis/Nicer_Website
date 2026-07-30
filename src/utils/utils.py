"""
Misc functions used elsewhere
"""
from typing import Any

import numpy as np
from numpy import ndarray


def progress_bar(i: int, total: int, text: str = '', **kwargs: Any) -> None:
    """
    Terminal progress bar

    Parameters
    ----------
    i : int
        Current progress
    total : int
        Completion number
    text : str, default = ''
        Optional text to place at the end of the progress bar

    **kwargs
        Optional keyword arguments to pass to print
    """
    filled: int
    length: int = 50
    percent: float
    bar_fill: str
    i += 1

    filled = int(i * length / total)
    percent = i * 100 / total
    bar_fill = '█' * filled + '-' * (length - filled)
    print(f'\rProgress: |{bar_fill}| {int(percent)}%\t{text}\t', end='', **kwargs)

    if i == total:
        print()


def min_bin(
        min_value: int,
        data: ndarray[tuple[int], np.dtype[np.float64]]) -> ndarray[tuple[int], np.dtype[np.int_]]:
    """
    Calculates the bin indices to ensure each bin has the minimum number of counts.
    """
    i: int
    bin_counts: float
    count: float = 0.0
    bins = [0]

    if len(data) == 0:
        return np.array([0], dtype=np.int_)

    if min_value <= 0:
        return np.arange(len(data) + 1, dtype=np.int_)

    for i, bin_counts in enumerate(data[:-1]):
        count += bin_counts

        if count >= min_value:
            bins.append(i + 1)
            count = 0.0

    if len(data) > 0:
        if data[-1] < min_value and len(bins) > 1:
            bins[-1] = len(data)
        else:
            bins.append(len(data))

    if len(bins) < 2:
        bins = [0, len(data)]
        
    return np.array(bins, dtype=np.int_)


def binning(
        bins: ndarray[tuple[int], np.dtype[np.int_]],
        data: ndarray[tuple[int] | tuple[int, int], np.dtype[np.float64]],
        weights: ndarray[tuple[int], np.dtype[np.float64]] | None = None) -> tuple[
            ndarray[tuple[int, int], np.dtype[np.float64]],
            ndarray[tuple[int], np.dtype[np.float64]],
            ndarray[tuple[int, int], np.dtype[np.float64]]]:
    """
    Bin data into bins using optimized numpy vectorization.
    """
    if len(bins) < 2:
        raise ValueError("Need at least 2 bin edges")

    if len(data.shape) > 1:
        data = data.swapaxes(0, 1)
    else:
        data = data[:, np.newaxis]

    if data.shape[0] == 0:
        return np.array([]), np.array([]), np.array([])

    if weights is None:
        weights = np.ones(data.shape[0])

    data = data * weights[:, np.newaxis]

    start_idx = np.clip(bins[:-1], 0, data.shape[0] - 1)
    end_idx = np.clip(bins[1:], start_idx + 1, data.shape[0])

    cum_data = np.vstack([np.zeros((1, data.shape[1])), np.cumsum(data, axis=0)])
    cum_weights = np.concatenate([[0], np.cumsum(weights)])

    bin_counts = cum_data[end_idx] - cum_data[start_idx]
    bin_widths = cum_weights[end_idx] - cum_weights[start_idx]

    valid = bin_widths > 0
    data_bin = np.zeros_like(bin_counts)
    uncertainty = np.zeros_like(bin_counts)

    data_bin[valid] = bin_counts[valid] / bin_widths[valid, np.newaxis]
    uncertainty[valid] = np.sqrt(np.maximum(bin_counts[valid], 1)) / bin_widths[valid, np.newaxis]

    data_bin[~valid] = bin_counts[~valid]
    uncertainty[~valid] = np.sqrt(np.maximum(bin_counts[~valid], 1))

    if data_bin.shape[1] != 1:
        data_bin = data_bin.swapaxes(0, 1)
        uncertainty = uncertainty.swapaxes(0, 1)
    else:
        data_bin = data_bin[:, 0]
        uncertainty = uncertainty[:, 0]

    return data_bin, bin_widths, uncertainty

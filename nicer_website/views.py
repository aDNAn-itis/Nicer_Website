"""
Main functions for backend functionality of the website home
"""
import os
import zipfile
import tempfile
from django.shortcuts import render
from django.http import HttpRequest, HttpResponse, Http404
from django.conf import settings


def index(request: HttpRequest) -> HttpResponse:
    """
    Default index function to return homepage

    Parameters
    ----------
    request : HttpRequest
        Http request for the homepage

    Returns
    -------
    HttpResponse
        Http response containing the homepage
    """
    return render(request, 'index.html')


def about(request: HttpRequest) -> HttpResponse:
    """
    About page with general information about the website and mission

    Parameters
    ----------
    request : HttpRequest
        Http request for the about page

    Returns
    -------
    HttpResponse
        Http response containing the about page
    """
    return render(request, 'about.html')


def mission_details(request: HttpRequest) -> HttpResponse:
    """
    Mission details page with comprehensive information about NICER

    Parameters
    ----------
    request : HttpRequest
        Http request for the mission details page

    Returns
    -------
    HttpResponse
        Http response containing the mission details page
    """
    return render(request, 'mission_details.html')


def science_details(request: HttpRequest) -> HttpResponse:
    """
    Science details page with information about NICER's scientific objectives

    Parameters
    ----------
    request : HttpRequest
        Http request for the science details page

    Returns
    -------
    HttpResponse
        Http response containing the science details page
    """
    return render(request, 'science_details.html')


def download_exported_spectra(request: HttpRequest, file_pattern: str) -> HttpResponse:
    """
    Download exported spectrum files as a ZIP archive

    Parameters
    ----------
    request : HttpRequest
        Http request for the download
    file_pattern : str
        Pattern like "obs_1130360113_GTI0-6" to match exported files

    Returns
    -------
    HttpResponse
        ZIP file containing the exported spectrum files
    """
    # Define the exported spectra directory
    exported_dir = os.path.join(os.path.dirname(settings.BASE_DIR), 'exported_spectra')

    if not os.path.exists(exported_dir):
        raise Http404("Exported spectra directory not found")

    # Find matching files
    matching_files = []
    for filename in os.listdir(exported_dir):
        if filename.startswith(file_pattern) and not filename.endswith('_summary.txt'):
            file_path = os.path.join(exported_dir, filename)
            if os.path.isfile(file_path):
                matching_files.append((filename, file_path))

    if not matching_files:
        raise Http404("No exported spectrum files found for the specified pattern")

    # Create ZIP file in memory
    with tempfile.NamedTemporaryFile() as tmp_file:
        with zipfile.ZipFile(tmp_file, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for filename, file_path in matching_files:
                zip_file.write(file_path, filename)

        tmp_file.seek(0)
        zip_content = tmp_file.read()

    # Create response
    response = HttpResponse(zip_content, content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{file_pattern}_spectrum_files.zip"'

    return response


def download_all_exported_spectra(request: HttpRequest) -> HttpResponse:
    """
    Download all files from the exported_spectra folder as a ZIP archive

    Parameters
    ----------
    request : HttpRequest
        Http request for the download

    Returns
    -------
    HttpResponse
        ZIP file containing all exported spectrum files
    """
    # Define the exported spectra directory
    exported_dir = os.path.join(os.path.dirname(settings.BASE_DIR), 'exported_spectra')

    if not os.path.exists(exported_dir):
        raise Http404("Exported spectra directory not found")

    # Get all files in the directory
    all_files = []
    for filename in os.listdir(exported_dir):
        file_path = os.path.join(exported_dir, filename)
        if os.path.isfile(file_path):
            all_files.append((filename, file_path))

    if not all_files:
        raise Http404("No exported spectrum files found")

    # Create ZIP file in memory
    with tempfile.NamedTemporaryFile() as tmp_file:
        with zipfile.ZipFile(tmp_file, 'w', zipfile.ZIP_DEFLATED) as zip_file:
            for filename, file_path in all_files:
                zip_file.write(file_path, filename)

        tmp_file.seek(0)
        zip_content = tmp_file.read()

    # Create response
    response = HttpResponse(zip_content, content_type='application/zip')
    response['Content-Disposition'] = 'attachment; filename="exported_spectra_all_files.zip"'

    return response

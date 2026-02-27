"""
Main functions for backend functionality of the file manager page
"""
import os

from django.shortcuts import render
from django.db.models import QuerySet
from django.http import HttpRequest, HttpResponse, JsonResponse

from nicer_website.apps.file_mgr.models import Item


def dir_file_fetcher(start: int, end: int, path: str) -> tuple[QuerySet[Item], QuerySet[Item]]:
    """
    Fetches the directories and files for the current directory level

    Parameters
    ----------
    start : int
        Start index to fetch the files and directories
    end : int
        End index to fetch the files and directories
    path : str
        Current directory

    Returns
    -------
    tuple[QuerySet[Item], QuerySet[Item]]
        Directories and files
    """
    return (
        Item.objects.filter(path=path, type=Item.dir).order_by('name')[start:end],
        Item.objects.filter(path=path, type=Item.file).order_by('name')[start:end],
    )


def directory(request: HttpRequest, path: str) -> HttpResponse:
    """
    Displays the contents of the current directory

    Parameters
    ----------
    request : HttpRequest
        Http request for the current directory
    path : str
        Path to the directory

    Returns
    -------
    HttpResponse
        Http response containing the directory page
    """
    parent_path: str = os.path.dirname(path) or Item.root
    return render(
        request,
        'file_mgr/directory.html', {'current_dir': path, 'parent_path': parent_path},
    )


def file(request: HttpRequest, path: str) -> HttpResponse:
    """
    Displays the file contents, currently only supports images

    Parameters
    ----------
    request : HttpRequest
        Http request for the file
    path : str
        Path to the file

    Returns
    -------
    HttpResponse
        Http response containing the file page
    """
    file_name: str = os.path.basename(path)
    parent_path: str = os.path.dirname(path) or Item.root
    file_object = Item.objects.filter(path=parent_path).get(name=file_name)

    return render(
        request,
        'file_mgr/file.html', {'parent_path': parent_path, 'file': file_object},
    )


def file_request(request: HttpRequest) -> JsonResponse:
    """
    Fetches the directories and files for the current directory level

    Parameters
    ----------
    request : HttpRequest
        Http request for the current directory level

    Returns
    -------
    JsonResponse
        Directories and files to display in the current directory level
    """
    start = int(request.GET.get('start', 0))
    end = int(request.GET.get('end', -1))
    path = request.GET.get('path', '') or Item.root
    dirs, files = dir_file_fetcher(start, end, path)
    return JsonResponse({"dirs": list(dirs.values()), "files": list(files.values())})

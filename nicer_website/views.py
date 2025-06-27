"""
Main functions for backend functionality of the website home
"""
from django.shortcuts import render
from django.http import HttpRequest, HttpResponse


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

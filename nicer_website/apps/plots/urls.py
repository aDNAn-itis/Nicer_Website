"""
URLs for the plots app to call functions in views
"""
from django.urls import path

from . import views


app_name = 'plots'  # pylint: disable=invalid-name
urlpatterns = [
    path('interactive_plot/', views.interactive_plot, name='plots'),
    path('fetch_observations', views.fetch_observations, name='fetch_observations'),
    path('plot_data', views.plot_data, name='plot_data'),
    path('plot_gti', views.plot_gti, name='plot_gti'),
    path('fetch_sources', views.fetch_sources, name='fetch_sources'),
    path('download', views.download_data, name='download_data'),
]

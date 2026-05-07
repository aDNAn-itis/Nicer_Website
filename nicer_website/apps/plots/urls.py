"""
URLs for the plots app to call functions in views
Integrated Version: v2026.05.03
"""
from django.urls import path
from . import views

app_name = 'plots'
urlpatterns = [
    path('interactive_plot/', views.interactive_plot, name='plots'),
    path('fetch_observations', views.fetch_observations, name='fetch_observations'),
    path('fetch_gtis', views.fetch_gtis, name='fetch_gtis'),
    path('plot_data', views.plot_data, name='plot_data'),
    path('plot_gti', views.plot_gti, name='plot_gti'),
    path('plot_single_gti/', views.plot_single_gti, name='plot_single_gti'),
    path('fetch_sources', views.fetch_sources, name='fetch_sources'),
    path('download', views.download_data, name='download_data'),
    path('source_search/', views.source_search_view, name='source_search'),
    path('plot_combined', views.plot_combined_global_hid, name='plot_combined'),
    
]
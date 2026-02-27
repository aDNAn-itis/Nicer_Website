"""
Models for the file_mgr database
"""
from django.db import models


class Item(models.Model):
    """
    Model for the file manager database to contain the files and directories with their paths
    """
    dir = 'dir'
    file = 'file'
    root = '/'
    item_type = [(dir, 'Dir'), (file, 'File')]

    obs_id = models.BigIntegerField(null=True)
    gti = models.IntegerField(null=True)

    tstart_tt = models.FloatField(null=True)
    tstop_tt = models.FloatField(null=True)
    ra = models.FloatField(null=True)
    dec = models.FloatField(null=True)
    ndets_used = models.FloatField(null=True)
    ushoot_net_rate = models.FloatField(null=True)
    oshoot_net_rate = models.FloatField(null=True)
    goodx_0p5_12_rate = models.FloatField(null=True)

    name = models.CharField(max_length=64)
    quality = models.CharField(max_length=8, blank=True)
    path = models.CharField(max_length=100, default=root)
    file_type = models.CharField(max_length=16, blank=True)
    type = models.CharField(max_length=4, choices=item_type, default=dir)
    source = models.CharField(max_length=100, blank=True)


    class Meta:
        """
        Metadata for the file manager model to prevent duplicate entries with the same name, path,
        and type, as well as creating an index on the path column to increase indexing performance
        """
        constraints = [
            models.UniqueConstraint(fields=('name', 'path', 'type'), name='unique_name_path_type'),
        ]

        indexes = [
            models.Index(fields=['path'], name='path_idx'),
            models.Index(fields=['obs_id'], name='obs_idx'),
            models.Index(fields=['source'], name='source_idx'),
        ]

    def __str__(self):
        return str(self.name)

# create index file_mgr_item_path_idx on file_mgr_item (path)

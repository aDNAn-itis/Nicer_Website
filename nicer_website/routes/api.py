from flask import send_file, request, Response
import os
from pathlib import Path
import json

@app.route('/api/download')
def download_data():
    data_type = request.args.get('type')
    obs_id = request.args.get('obs_id')
    file_path = request.args.get('file_path')
    gti_numbers = request.args.get('gti_numbers')

    if not obs_id:
        return Response('OBS_ID is required', status=400)

    try:
        # If specific file path is provided, use it
        if file_path:
            if not os.path.exists(file_path):
                return Response('File not found', status=404)
            return send_file(
                file_path,
                as_attachment=True,
                download_name=os.path.basename(file_path)
            )

        # Handle different data types
        with open('../../../config.txt', mode='r', encoding='utf8') as file:
            DATA_DIR = json.load(file)['data_dir']
        base_path = Path(DATA_DIR)
        
        if data_type == 'gti':
            if gti_numbers:
                # Handle multiple GTIs
                gti_list = gti_numbers.split(',')
                if len(gti_list) == 1:
                    file_path = base_path / obs_id / 'xti' / 'event_cl' / f'{obs_id}_GTI{gti_list[0]}.fits'
                    if not file_path.exists():
                        return Response('File not found', status=404)
                    return send_file(
                        str(file_path),
                        as_attachment=True,
                        download_name=file_path.name
                    )
                else:
                    # Create a zip file containing multiple GTIs
                    return create_gti_archive(obs_id, gti_list, base_path)
            else:
                file_path = base_path / obs_id / 'xti' / 'event_cl' / f'{obs_id}_gti.fits'
        elif data_type == 'obs':
            return create_obs_archive(obs_id)
        else:
            return Response('Invalid data type', status=400)

        if not file_path.exists():
            return Response('File not found', status=404)

        return send_file(
            str(file_path),
            as_attachment=True,
            download_name=file_path.name
        )

    except Exception as e:
        return Response(f'Error: {str(e)}', status=500)

def create_gti_archive(obs_id, gti_list, base_path):
    """Create a zip archive of selected GTI files"""
    import tempfile
    import zipfile
    
    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        with zipfile.ZipFile(tmp.name, 'w') as archive:
            for gti_num in gti_list:
                # Look in the jspipe directory for GTI files
                file_path = base_path / obs_id / 'jspipe' / f'js_{obs_id}_GTI{gti_num}_BGDATA.fits'
                if file_path.exists():
                    archive.write(str(file_path), file_path.name)
                else:
                    # Try alternative path in event_cl directory
                    alt_file_path = base_path / obs_id / 'xti' / 'event_cl' / f'{obs_id}_GTI{gti_num}.fits'
                    if alt_file_path.exists():
                        archive.write(str(alt_file_path), alt_file_path.name)
        
        return send_file(
            tmp.name,
            as_attachment=True,
            download_name=f'{obs_id}_GTI_{"-".join(gti_list)}.zip'
        )

def create_obs_archive(obs_id):
    """Create a zip archive of an entire observation"""
    import tempfile
    import shutil
    
    with open('../../../config.txt', mode='r', encoding='utf8') as file:
        DATA_DIR = json.load(file)['data_dir']
    base_path = Path(DATA_DIR)
    obs_path = base_path / obs_id
    
    if not obs_path.exists():
        return Response('Observation not found', status=404)

    # Create temporary zip file
    with tempfile.NamedTemporaryFile(suffix='.zip', delete=False) as tmp:
        shutil.make_archive(tmp.name[:-4], 'zip', obs_path)
        return send_file(
            tmp.name,
            as_attachment=True,
            download_name=f'{obs_id}_full.zip'
        ) 
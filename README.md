# Nicer Website

Website code to replace existing Nicer data interface website: https://nicer-web.mit.edu/nicerview/

## Requirements

* Install PostgreSQL
* Install dependencies for production (prod) or development (dev): `pip install -r requirements/{prod|dev}.txt`
* Create PostgreSQL database (Linux based OS instructions)
    * Enter Postgres terminal: `sudo -u postgres psql`
    * Create user: `CREATE USER <username> WITH PASSWORD '<password>';`
    * Create database: `CREATE DATABASE <db_name> OWNER <username>;`
    * Assign owner: `GRANT ALL PRIVILEGES ON DATABASE <db_name> TO <username>;`
* Create `db_user.json` in project root directory with entries:
    * `"USER": "<username>"`
    * `"PASSWORD": "<password>"`
* Create `config.json` in project root directory with entries:
    * `"data_dir": "<path_to_data>"`
    * `"database_name": "<db_name>"`
* Create new secret key:
    * Create `.env` file under root directory
    * Generate new secret key by running `generate_secret_key.py` and copying the output into the `.env` file
* Migrate database: Run `python manage.py migrate` in the terminal

## Running Website Locally

* Start website server: Run `python manage.py runserver` in the terminal
* Open website: In a web browser, go to `http://127.0.0.1:8000`

## Adding Data to the Database

* Configure database update script: Open `config.json` in a text editor and specify the path to the data under the variable `"data_dir"`
* Run `src/db_update.py` script
* Check website Directory tab for the new data: If already on Directory, you will have to refresh the page
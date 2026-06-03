@echo off
echo ========================================
echo   Sisuraksha Face Recognition Setup
echo ========================================
echo.

python -m venv venv
if %ERRORLEVEL% neq 0 (
    echo ERROR: Failed to create virtual environment. Make sure Python 3.9+ is installed.
    pause
    exit /b 1
)

call venv\Scripts\activate

pip install --upgrade pip
pip install -r requirements.txt

echo.
echo ========================================
echo   Setup complete!
echo   To run:  venv\Scripts\python flask_app.py
echo ========================================
pause

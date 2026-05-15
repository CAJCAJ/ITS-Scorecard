@echo off
cd /d "%~dp0"
set "PYTHON_EXE=%USERPROFILE%\anaconda3\envs\itsscorecard\python.exe"
if exist "%PYTHON_EXE%" (
  "%PYTHON_EXE%" scorecard_backend\keep_supabase_awake.py >> scorecard_backend\supabase_keepalive_task.log 2>&1
) else (
  conda run --no-capture-output -n itsscorecard python scorecard_backend\keep_supabase_awake.py >> scorecard_backend\supabase_keepalive_task.log 2>&1
)
exit /b %ERRORLEVEL%

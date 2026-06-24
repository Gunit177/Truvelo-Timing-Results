import os
import sys
import time
import json
import urllib.request
import ssl # Built-in library to bypass outdated Windows XP encryption issues

# --- WINDOWS XP SSL BEYOND CERTIFICATE OVERRIDE ---
# Forces legacy Python 3.4 on Windows XP to ignore modern cloud SSL certificate rejections
try:
    ssl._create_default_https_context = ssl._create_unverified_context
except AttributeError:
    pass

# Locked into your perfect 1366 monitor width offset
os.environ['SDL_VIDEO_WINDOW_POS'] = "1366,0"

import pygame
import win32com.client 

# --- EXACT CONFIGURATION ---
FILE_PATH = r"C:\projek\dragrace\database\******"
TABLE_NAME = "log"  

# --- COLOR SYSTEM ---
COLOR_BG = (10, 10, 12)            # Deep Space Black
COLOR_PANEL_BG = (24, 26, 32)      # Premium Matte Grey Blocks
COLOR_TEXT_HEADER = (255, 204, 0)  # High-Visibility Amber/Gold
COLOR_TEXT_INFO = (230, 230, 230)   # Bright White
COLOR_TEXT_LABEL = (150, 155, 165)  # Muted Silver Grey
COLOR_TEXT_VALUE = (0, 255, 100)    # Racing Digital Lime Green
COLOR_COMPANY = (0, 220, 255)       # Glowing Neon Electric Blue

# --- LOGO CONFIGURATION ---
LOGO_PATH = r"C:\Documents and Settings\Administrator\My Documents\Downloads\*******************"

# Initialize Graphics
pygame.init()
pygame.font.init()

SCREEN_WIDTH = 1920
SCREEN_HEIGHT = 1080
screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT), pygame.NOFRAME)
pygame.display.set_caption("Drag Racing Results Board")

# Load and scale logo dynamically 
logo_img = None
if os.path.exists(LOGO_PATH):
    try:
        raw_logo = pygame.image.load(LOGO_PATH).convert_alpha()
        orig_w, orig_h = raw_logo.get_size()
        baseline_h = 106
        baseline_w = int(orig_w * (baseline_h / orig_h))
        
        # Enlarge baseline sizes by exactly your requested pixel values
        final_w = baseline_w + 104
        final_h = baseline_h + 52
        logo_img = pygame.transform.smoothscale(raw_logo, (final_w, final_h))
    except Exception as logo_err:
        print("Could not load logo image:", logo_err)

# --- SCALE TYPOGRAPHY ---
font_company = pygame.font.SysFont("Arial", 85, bold=True) 
font_lane = pygame.font.SysFont("Arial", 60, bold=True)
font_driver = pygame.font.SysFont("Arial", 36, bold=True)
font_label = pygame.font.SysFont("Arial", 28, bold=True)
font_value = pygame.font.SysFont("Arial", 38, bold=True)

# --- FREE SUPABASE SYNC PARAMETERS ---
SUPABASE_URL = "https://qgprnewkdzluruihzyhy.supabase.co/rest/v1/raceresults"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFncHJuZXdrZHpsdXJ1aWh6eWh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMjI5MDgsImV4cCI6MjA5NzY5ODkwOH0.WjSnTF80FAABypJuDJfSTvd5_qigr4mJa-TCEsE-4Bc"

def upload_to_free_web_dashboard(data):
    """Sends the racing telemetry to your free Supabase database over standard HTTP."""
    try:
        payload = {
            "ID1":       data["l1"]["num"],     
            "Driver1":   data["l1"]["name"],    
            "Class1":    data["l1"]["class"],   
            "Car1":      data["l1"]["car"],     
            "Reaction1": data["l1"]["rt"],      
            "Sixty1":    data["l1"]["60ft"],    
            "QuartT1":   data["l1"]["4et"],     
            "QuartS1":   data["l1"]["4kmh"],    
            
            "ID2":       data["l2"]["num"],     
            "Driver2":   data["l2"]["name"],    
            "Class2":    data["l2"]["class"],   
            "Car2":      data["l2"]["car"],     
            "Reaction2": data["l2"]["rt"],      
            "Sixty2":    data["l2"]["60ft"],    
            "QuartT2":   data["l2"]["4et"],     
            "QuartS2":   data["l2"]["4kmh"]     
        }
        
        json_data = json.dumps(payload).encode('utf-8')
        
        req = urllib.request.Request(SUPABASE_URL, data=json_data)
        req.add_header('Content-Type', 'application/json')
        req.add_header('apikey', SUPABASE_KEY)
        req.add_header('Authorization', 'Bearer ' + SUPABASE_KEY)
        req.add_header('Prefer', 'return=minimal') 
        
        response = urllib.request.urlopen(req, timeout=5)
        response.read()
        print("Success: Live run telemetry synced to the FREE Supabase web database!")
        
    except Exception as web_err:
        print("Web Synchronization Warning (Track internet may be down):", web_err)

def get_latest_race_data_via_excel():
    """Launches hidden Excel instance, reads the last row parsed by Excel, and returns data."""
    excel = None
    wb = None
    try:
        excel = win32com.client.Dispatch("Excel.Application")
        excel.Visible = False
        excel.DisplayAlerts = False
        
        wb = excel.Workbooks.Open(FILE_PATH)
        sheet = wb.ActiveSheet
        
        last_row_index = sheet.Cells(sheet.Rows.Count, "A").End(-4162).Row 
        
        if last_row_index < 2:
            raise ValueError("No race rows found in Excel sheet layout.")
            
        row = []
        for col in range(1, 46):
            val = sheet.Cells(last_row_index, col).Value
            row.append("" if val is None else str(val))
            
        wb.Close(False)
        excel.Quit()
        
        # --- SMART FORMATTING ENGINE ---
        def clean_text(val):
            return "" if val is None else str(val).strip()

        def clean_int(val):
            if val is None or val == "": return "---"
            try:
                return str(int(float(val)))
            except ValueError:
                return str(val).strip()

        def clean_speed(val):
            if val is None or val == "": return "---"
            try:
                num = float(val)
                if num == 0: return "---"
                return "{:.1f}".format(num)
            except ValueError:
                return str(val).strip()

        def clean_time(val):
            if val is None or val == "": return "---"
            try:
                num = float(val)
                if num == 0: return "---"
                return "{:.3f}".format(num)
            except ValueError:
                return str(val).strip()
        
        # Map values matching your precise sequential Column A-AQ array layout
        return {
            "l1": {
                "num":   clean_int(row[1]),     
                "name":  clean_text(row[2]),    
                "car":   clean_text(row[4]),    
                "class": clean_text(row[5]),    
                "rt":    clean_time(row[7]),    
                "60ft":  clean_time(row[8]),    
                "4et":   clean_time(row[9]),    
                "4kmh":  clean_speed(row[10]),  
                "8et":   clean_time(row[13]),   
                "8kmh":  clean_speed(row[14]),  
                "2et":   clean_time(row[15]),   
                "2kmh":  clean_speed(row[16])   
            },
            "l2": {
                "num":   clean_int(row[20]),    
                "name":  clean_text(row[21]),    
                "car":   clean_text(row[23]),    
                "class": clean_text(row[24]),    
                "rt":    clean_time(row[26]),    
                "60ft":  clean_time(row[27]),    
                "4et":   clean_time(row[28]),    
                "4kmh":  clean_speed(row[29]),  
                "8et":   clean_time(row[32]),   
                "8kmh":  clean_speed(row[33]),  
                "2et":   clean_time(row[34]),   
                "2kmh":  clean_speed(row[35])   
            }
        }
    except Exception as e:
        print("Excel Parsing Error:", e)
        try:
            if wb: wb.Close(False)
            if excel: excel.Quit()
        except:
            pass
        
    fallback = {"name": "---", "class": "---", "num": "---", "car": "---", "rt": "0.000", "60ft": "0.000", "8et": "0.000", "8kmh": "0.0", "4et": "0.000", "4kmh": "0.0", "2et": "0.000", "2kmh": "0.0"}
    return {"l1": fallback, "l2": fallback}

def render_lane_panel(lane_key, start_x, data):
    """Draws a complete custom UI layout from scratch for a single lane."""
    panel_w = 900
    panel_h = 880   
    top_y = 160     
    
    pygame.draw.rect(screen, COLOR_PANEL_BG, (start_x, top_y, panel_w, panel_h))
    
    title_text = "LANE 1" if lane_key == "l1" else "LANE 2"
    txt_title = font_lane.render(title_text, True, COLOR_TEXT_HEADER)
    screen.blit(txt_title, (start_x + (panel_w // 2) - (txt_title.get_width() // 2), top_y + 20))
    
    meta_y = top_y + 110
    txt_meta1 = font_driver.render("Driver: {}   Class: {}   # {}".format(data["name"], data["class"], data["num"]), True, COLOR_TEXT_INFO)
    txt_meta2 = font_driver.render("Car: {}".format(data["car"]), True, COLOR_TEXT_INFO)
    screen.blit(txt_meta1, (start_x + 40, meta_y))
    screen.blit(txt_meta2, (start_x + 40, meta_y + 50))
    
    pygame.draw.line(screen, (60, 65, 80), (start_x + 30, meta_y + 105), (start_x + panel_w - 30, meta_y + 105), 2)
    
    col1_x = start_x + 40
    col2_x = start_x + 470
    start_metrics_y = meta_y + 120
    row_stride = 150 
    
    left_metrics = [
        ("REACTION TIME:", data["rt"]),
        ("60 FOOT TIME:", data["60ft"]),
        ("1/4 MILE TIME:", data["4et"]),
        ("1/4 SPEED (km/h):", data["4kmh"])
    ]
    
    right_metrics = [
        ("1/8 MILE TIME:", data["8et"]),
        ("1/8 SPEED (km/h):", data["8kmh"]),
        ("1/2 MILE TIME:", data["2et"]),
        ("1/2 SPEED (km/h):", data["2kmh"])
    ]
    
    for i, (lbl, val) in enumerate(left_metrics):
        y_pos = start_metrics_y + (i * row_stride)
        lbl_surf = font_label.render(lbl, True, COLOR_TEXT_LABEL)
        val_surf = font_value.render(val, True, COLOR_TEXT_VALUE)
        screen.blit(lbl_surf, (col1_x, y_pos))
        screen.blit(val_surf, (col1_x, y_pos + 38))
        
    for i, (lbl, val) in enumerate(right_metrics):
        y_pos = start_metrics_y + (i * row_stride)
        lbl_surf = font_label.render(lbl, True, COLOR_TEXT_LABEL)
        val_surf = font_value.render(val, True, COLOR_TEXT_VALUE)
        screen.blit(lbl_surf, (col2_x, y_pos))
        screen.blit(val_surf, (col2_x, y_pos + 38))

def draw_layout(race_data, logo_img):
    """Refreshes basic canvas frame, prints master branding title, and generates lane blocks."""
    screen.fill(COLOR_BG)
    
    # Render the "Ralf Gebert Timing Services" header centered at the top
    txt_company = font_company.render("Ralf Gebert Timing Services", True, COLOR_COMPANY)
    screen.blit(txt_company, ((SCREEN_WIDTH // 2) - (txt_company.get_width() // 2), 25))
    
    # Draw the scaled logo in the top left-hand corner if it loaded successfully
    if logo_img:
        screen.blit(logo_img, (40, 15))
    
    # Process side panels
    render_lane_panel("l1", 40, race_data["l1"])   
    render_lane_panel("l2", 980, race_data["l2"])  
    pygame.display.flip()

def main():
    if not os.path.exists(FILE_PATH):
        print("Fatal Error: File not found at target path.")
        sys.exit()

    last_modified = os.path.getmtime(FILE_PATH)
    race_data = get_latest_race_data_via_excel()
    upload_to_free_web_dashboard(race_data)
    draw_layout(race_data, logo_img)
    
    running = True
    while running:
        for event in pygame.event.get():
            if event.type == pygame.QUIT or (event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE):
                running = False
                
        try:
            current_modified = os.path.getmtime(FILE_PATH)
            if current_modified != last_modified:
                last_modified = current_modified
                time.sleep(0.5) # Timing buffer
                race_data = get_latest_race_data_via_excel()
                
                # Render results on your physical local LCD track scoreboard instantly
                draw_layout(race_data, logo_img)
                
                # Look inside your while loop and make sure this line matches the name:
                upload_to_free_web_dashboard(race_data)

        except OSError:
            pass
            
        time.sleep(1)

    pygame.quit()

if __name__ == "__main__":
    main()

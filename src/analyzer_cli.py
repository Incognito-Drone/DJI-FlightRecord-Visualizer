import subprocess
import json
import os
import sys

class DJILogAnalyzer:
    def __init__(self, executable_path, api_key):
        self.executable_path = executable_path
        self.api_key = api_key

    def parse_log(self, log_path):
        # 1. 로그 파일 확인
        if not os.path.exists(log_path):
            print(f"[!] 로그 파일을 찾을 수 없습니다: {log_path}")
            return None

        # 2. 저장할 파일명 생성 (원본파일명_decrypted.txt)
        output_txt_path = os.path.splitext(log_path)[0] + "_decrypted.txt"

        # 3. 명령어 구성
        command = [
            self.executable_path,
            log_path,
            "--api-key", self.api_key
        ]

        try:
            print(f"[*] 분석 프로세스 실행 중...")
            # 외부 프로세스 실행
            result = subprocess.run(
                command,
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace'
            )
            
            if result.returncode != 0:
                print(f"[-] 에러 발생: {result.stderr}")
                return None

            # 4. [기능 유지] 결과를 텍스트 파일로 저장
            try:
                with open(output_txt_path, "w", encoding="utf-8") as f:
                    f.write(result.stdout)
                print(f"[+] 전체 로그가 파일로 저장되었습니다: {output_txt_path}")
            except Exception as e:
                print(f"[!] 파일 저장 중 오류 발생: {e}")

            # 5. JSON 객체로 변환하여 반환
            try:
                json_data = json.loads(result.stdout)
                return json_data
            except json.JSONDecodeError:
                print("[!] JSON 변환 실패")
                return None

        except Exception as e:
            print(f"Error executing parser: {e}")
            return None

    def extract_flight_info(self, data):
        """
        수정됨: 업로드된 파일 구조(details, frames)에 맞춰 데이터 추출
        """
        summary = {
            "aircraft_name": "Unknown",
            "serial_number": "Unknown",
            "flight_points": []
        }

        # [수정 1] 기기 정보 위치 변경 (details)
        if isinstance(data, dict):
            details = data.get('details', {})
            summary['aircraft_name'] = details.get('aircraftName', 'Unknown')
            summary['serial_number'] = details.get('aircraftSn', 'Unknown')
            
            # [수정 2] 비행 기록 위치 변경 (frames)
            # DJI Neo 로그 등 최신 버전은 'frames'를 사용합니다.
            frames = data.get('frames', [])
            if not frames:
                frames = data.get('records', []) # 호환성 대비
        else:
            # 리스트로 오는 구형 로그 대응
            frames = data if isinstance(data, list) else []
            if frames and isinstance(frames[0], dict):
                summary['aircraft_name'] = frames[0].get('recover', {}).get('aircraftName', 'Unknown')

        # 좌표 추출 루프
        for frame in frames:
            # 구조: frame -> osd -> latitude/longitude
            osd = frame.get('osd', {})
            custom = frame.get('custom', {})
            
            lat = osd.get('latitude')
            lon = osd.get('longitude')
            
            # 위도, 경도가 존재하는 경우만 저장
            if lat is not None and lon is not None:
                point = {
                    'time': custom.get('dateTime', 'N/A'),
                    'lat': lat,
                    'lon': lon,
                    'alt': osd.get('altitude', 0),
                    'height': osd.get('height', 0)
                }
                summary['flight_points'].append(point)
        
        return summary

# --- CLI 실행 부분 ---
if __name__ == "__main__":
    # 1. 경로 설정 (현재 파일 위치 기준)
    current_dir = os.path.dirname(os.path.abspath(__file__))
    PARSER_BIN = os.path.join(current_dir, "dji-log.exe")
    
    # 2. API 키 입력 (본인 키 확인 필수)
    MY_API_KEY = "4d0731fe7a5d781d31f3a390a841aae" #더미값
    
    # 3. 분석할 로그 파일 경로
    TARGET_LOG = r"D:\Drone-DFIR\android_external\dji.go.v5\files\FlightRecord\FlightRecord_2026-03-22_[18-57-02].txt"

    analyzer = DJILogAnalyzer(PARSER_BIN, MY_API_KEY)
    
    print(f"[*] {os.path.basename(TARGET_LOG)} 분석 시작...")
    data = analyzer.parse_log(TARGET_LOG)
    
    if data:
        print("\n" + "="*30)
        print("      요약 정보 출력")
        print("="*30)

        # 수정된 추출 함수 호출
        flight_info = analyzer.extract_flight_info(data)
        
        print(f"[+] 기기 모델: {flight_info['aircraft_name']}")
        print(f"[+] 시리얼 번호: {flight_info['serial_number']}")
        
        points = flight_info['flight_points']
        print(f"[+] 추출된 GPS 포인트 수: {len(points)}개")
        
        if len(points) > 0:
            print("\n[+] 초기 경로 샘플:")
            # 유효한 시간값이 있는 것부터 보여주기 위해 앞부분 출력
            for p in points[:5]:
                print(f" -> 시간: {p['time']} | 위도: {p['lat']} | 경도: {p['lon']} | 고도: {p['alt']}m")
                
            print(f"\n[+] 마지막 위치:")
            last = points[-1]
            print(f" END. 시간: {last['time']} | 위도: {last['lat']} | 경도: {last['lon']} | 고도: {last['alt']}m")
    else:
        print("[-] 분석 실패")
import copy
import http.client
import json
import re
import threading
import unittest
from unittest.mock import patch

import test_html_export
from civmapper.server import ServerConfig, convert_save, make_server, upload_page


class ConversionTests(unittest.TestCase):
    def setUp(self):
        fixture=test_html_export.HTMLExportTests();fixture.setUp()
        self.world=fixture.world

    def test_uses_shared_pipeline_and_all_views(self):
        with patch('civmapper.server.extract_bytes',side_effect=lambda *a,**kw:copy.deepcopy(self.world)) as extract:
            document=convert_save(b'save',ServerConfig(), 'parchment')
        self.assertEqual(extract.call_count,2)
        self.assertTrue(extract.call_args.kwargs['include_units'])
        self.assertEqual(test_html_export.payload(document)['unavailable'],{})
        self.assertIn('id="export-png"',document)

    def test_unit_failure_preserves_political_world_and_reports_army_unavailable(self):
        world=copy.deepcopy(self.world);world.pop('units')
        with patch('civmapper.server.extract_bytes',side_effect=[world,ValueError('unsupported unit version')]):
            data=test_html_export.payload(convert_save(b'save',ServerConfig()))
        self.assertIn('army',data['unavailable'])
        self.assertNotIn('political',data['unavailable'])
        self.assertTrue(any('unsupported unit version' in w for w in data['world']['extraction']['warnings']))
        with patch('civmapper.server.extract_bytes',side_effect=ValueError('invalid plot')):
            with self.assertRaisesRegex(ValueError,'invalid plot'):convert_save(b'bad',ServerConfig())

    def test_enrichment_and_privacy_configuration(self):
        config=ServerConfig(ruleset='rules.db',localization='labels.db',player_names=False)
        with patch('civmapper.server.extract_bytes',return_value=self.world) as extract,patch('civmapper.server.enrich',return_value=self.world) as enrich:
            convert_save(b'save',config)
        self.assertFalse(extract.call_args.kwargs['include_player_names'])
        enrich.assert_called_once_with(self.world,'rules.db','labels.db')


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.server=make_server(port=0)
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        status,document=self.request('GET','/')
        self.assertEqual(status,200)
        self.token=json.loads(re.search(r'<script id="upload-config" type="application/json">(.*?)</script>',document).group(1))['token']

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join()

    def request(self,method,path,body=None,headers=None):
        conn=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=5)
        conn.request(method,path,body,headers or {})
        response=conn.getresponse();result=(response.status,response.read().decode());conn.close();return result

    def test_upload_and_no_filesystem_routes(self):
        with patch('civmapper.server.convert_save',return_value='<!doctype html>map') as convert:
            status,body=self.request('POST','/upload?style=minimalist',b'real bytes',{'X-CivMapper-Token':self.token})
        self.assertEqual(status,200);self.assertIn('map',body)
        convert.assert_called_once_with(b'real bytes',ServerConfig(),'minimalist')
        self.assertEqual(self.request('GET','/../../etc/passwd')[0],404)
        self.assertEqual(self.request('GET','/favicon.ico')[0],204)

    def test_upload_validation_and_parse_errors(self):
        headers={'X-CivMapper-Token':self.token}
        with patch('civmapper.server.convert_save') as convert:
            self.assertEqual(self.request('POST','/upload',b'bad')[0],403)
            self.assertEqual(self.request('POST','/upload?style=../../secret',b'bad',headers)[0],400)
            self.assertEqual(self.request('POST','/upload',b'',headers)[0],413)
            self.assertEqual(self.request('POST','/upload',b'x',dict(headers,**{'Content-Length':str(64*1024*1024+1)}))[0],413)
            self.assertEqual(self.request('POST','/upload',b'x',dict(headers,Origin='https://example.com'))[0],403)
            self.assertEqual(self.request('GET','/',headers={'Host':'example.com'})[0],403)
            convert.assert_not_called()
        with patch('civmapper.server.convert_save',side_effect=ValueError('unsupported plot')):
            status,body=self.request('POST','/upload',b'bad',headers)
        self.assertEqual(status,422);self.assertIn('unsupported plot',body)
        with patch('civmapper.server.convert_save',return_value='map'):
            self.assertEqual(self.request('POST','/upload',b'valid',headers)[0],200)

    def test_only_local_binding(self):
        with self.assertRaisesRegex(ValueError,'local upload'):make_server(host='0.0.0.0')
        with self.assertRaises(ValueError):make_server(port=-1)

    def test_upload_page_has_no_external_dependencies(self):
        page=upload_page('token')
        self.assertIn('type="file"',page)
        self.assertIn('srcdoc',page)
        self.assertNotIn('<script src=',page)
        self.assertNotIn('https://',page)

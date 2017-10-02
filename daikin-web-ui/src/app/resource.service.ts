import { Injectable } from '@angular/core'
import { HttpClient } from '@angular/common/http'
import 'rxjs/add/operator/toPromise'

@Injectable()
export class ResourceService {

  constructor (private $http: HttpClient) {
  }

  async get(url) {
    return await this.$http.get(url).toPromise()
  }

  async post(url, body) {
    return await this.$http.post(url, body).toPromise()
  }
}
